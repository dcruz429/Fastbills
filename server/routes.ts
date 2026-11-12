import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { db, pool } from "./db";
import { fileUploads, tasks, arbitrations, arbitrationActivity, denials, denialActivity, collections, collectionActivity, postings, postingActivity, checks, checkActivity, closed, closedActivity, taskActivity, users, DROPDOWN_CATEGORIES, OUTCOME_OPTIONS, ceoBox, CEO_USERS, DR_AL_NAME } from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { buildPatientOverview } from "./patient-overview";
import { searchPatientRecords } from "./patient-overview-query";
import { patientSearchTokens } from "../shared/patient-overview";
import { isPaidOnlyUpdate, validatePaidFlag } from "./paid-flag";
import { registerGuidelineBoardRoutes } from "./guideline-board";
import { registerMedicalRecordsRoutes } from "./medical-records-routes";
import { medicalRecordsRepository, ensureMedicalRecordsHistory } from "./medical-records-repository";
import { getProductivityTransfers } from "./productivity-transfers";
import { registerRcmAccessRoutes } from "./rcm-access-routes";
import { registerRcmTaskboardRoutes } from "./rcm-taskboard-routes";
import { registerRcmTaskAssignmentRoutes } from "./rcm-task-assignment-routes";
import { registerRcmApprovalRoutes } from "./rcm-approval-routes";
import { registerRcmProductivityRoutes } from "./rcm-productivity-routes";
import { registerRcmLegacyAssignmentRoutes } from "./rcm-legacy-assignment-routes";
import { registerRcmSlaRoutes } from "./rcm-sla-routes";
import { registerRcmQualityRoutes } from "./rcm-quality-routes";
import { resolveRcmAccess } from "./rcm-access-service";
import { permissionAllowed, resourceAllowed } from "../shared/rcm-access-policy";

const ADMIN_ROLES = ["admin", "manager", "assigner", "account_manager", "case_manager", "payment_specialist"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function saveUploadedFiles(files: Express.Multer.File[]): Promise<string[]> {
  const attachments: string[] = [];
  for (const f of files) {
    const base64 = f.buffer.toString("base64");
    const [row] = await db.insert(fileUploads).values({
      filename: `${Date.now()}-${randomBytes(4).toString("hex")}${path.extname(f.originalname)}`,
      originalName: f.originalname,
      mimeType: f.mimetype,
      data: base64,
      size: f.size,
    }).returning();
    attachments.push(`/api/files/${row.id}|${f.originalname}`);
  }
  return attachments;
}

async function getAssigneeUserId(assignedName: string | null | undefined): Promise<number | null> {
  if (!assignedName) return null;
  const allUsers = await storage.getAllUsers();
  const found = allUsers.find(u => u.fullName === assignedName);
  return found?.id ?? null;
}

function autoAssignStatus(data: any, existing?: any): any {
  if (existing && isPaidOnlyUpdate(data)) return data;
  const newAssigned = data.assignedTo !== undefined ? data.assignedTo : existing?.assignedTo;
  const newStatus = data.status !== undefined ? data.status : existing?.status;
  // Forms submit every field. A changed PAID checkbox must not implicitly
  // reassign the workflow status when assignment/status themselves are unchanged.
  const normalized = (value: unknown) => String(value ?? "").trim();
  if (existing && typeof data.paid === "boolean" && data.paid !== existing.paid
    && normalized(newAssigned) === normalized(existing.assignedTo)
    && normalized(newStatus) === normalized(existing.status)) {
    return data;
  }
  const hasAssignee = newAssigned != null && String(newAssigned).trim() !== "";
  const statusEmpty = !newStatus || ["", "unassigned"].includes(String(newStatus).trim().toLowerCase());
  if (hasAssignee && statusEmpty) {
    data.status = "Assigned";
  }
  return data;
}

function autoAssignTaskStatus(data: any, existing?: any): any {
  const newAssignedId = data.assignedUserId !== undefined ? data.assignedUserId : existing?.assignedUserId;
  const newStatus = data.status !== undefined ? data.status : existing?.status;
  if (newAssignedId && (!newStatus || newStatus === "unassigned")) {
    data.status = "assigned";
  }
  return data;
}

async function handleOutcomeTransfer(
  outcome: string,
  source: string,
  record: { patientName?: string; clinic?: string; insurance?: string; amount?: string | null; notes?: string | null; comments?: string | null; activityHistory?: { field: string; oldValue: string | null; newValue: string | null; action: string; timestamp: Date }[]; [key: string]: any },
  userId: number
) {
  // ── Core identity fields ──────────────────────────────────────────────────
  const patientName = record.patientName || "Unknown";
  const clinic      = record.clinic      || null;
  const insurance   = record.insurance   || null;
  const amount      = record.amount      || null;
  const paid        = record.paid === true;
  const assignedTo  = record.assignedTo  || null;

  // Notes — denials/arbitration use "comments", everything else uses "notes"
  const existingNotes = record.notes || record.comments || null;

  // ── Task-specific fields ──────────────────────────────────────────────────
  const chartNumber    = record.chartNumber    || null;
  const ieDate         = record.ieDate         || null;
  const dueDate        = record.dueDate        || null;
  const doa            = record.doa            || null;
  const resolutionDate = record.resolutionDate || null;

  // ── Shared date fields ────────────────────────────────────────────────────
  const dosFrom = record.dosFrom || null;
  const dosTo   = record.dosTo   || null;
  // inputDate (Collections) ↔ dateInput (Denials/Arb) — carry whichever is present
  const inputDate = record.inputDate || record.dateInput || null;
  const dateInput = record.dateInput || record.inputDate || null;
  const dateOfLetter  = record.dateOfLetter  || null;
  const effectiveDate = record.effectiveDate || null;
  const trialDate     = record.trialDate     || null;

  // ── Denial / Arbitration fields ───────────────────────────────────────────
  const typeOfDenial    = record.typeOfDenial    || null;
  // numberOfVisits (Collections) ↔ numberOfDays (Denials/Arb) — carry either
  const numberOfVisits  = record.numberOfVisits  || record.numberOfDays || null;
  const numberOfDays    = record.numberOfDays    || record.numberOfVisits || null;
  const filedTo         = record.filedTo         || null;
  const arbStatus       = record.arbStatus       || null;
  const arbPaymentStatus = record.arbPaymentStatus || null;
  const amountReceived  = record.amountReceived  || null;
  const checkedBy       = record.checkedBy       || null;
  const intake          = record.intake          || null;
  const denialFileName  = record.denialFileName  || null;

  // ── Collections-specific fields ───────────────────────────────────────────
  const division  = record.division  || null;
  const issueType = record.issueType || null;
  const action    = record.action    || null;
  const priority  = record.priority  || null;

  // ── Posting / Checks fields ───────────────────────────────────────────────
  const fileNumber  = record.fileNumber  || null;
  const documentType = record.documentType || null;
  const scannedDate = record.scannedDate || null;
  const postedDate  = record.postedDate  || null;
  const depositDate = record.depositDate || null;
  const depositedBy = record.depositedBy || null;
  const checkDate   = record.checkDate   || null;
  const checkNumber = record.checkNumber || null;
  const fileName    = record.fileName    || null;
  const checkType   = record.type        || null;

  // ── Closed-specific fields ────────────────────────────────────────────────
  const reason       = record.reason       || null;
  const regularVisit = record.regularVisit ?? null;
  const fullVisit    = record.fullVisit    ?? null;
  const reportedDate = record.reportedDate || null;

  // ── Notes with transfer header ────────────────────────────────────────────
  const transferHeader = `[Transferred from ${source} - ${new Date().toISOString()}]`;
  const combinedNotes = existingNotes
    ? `${transferHeader}\nTransferred from ${source}\n\n${existingNotes}`
    : `${transferHeader}\nTransferred from ${source}`;

  // ── Lookups ───────────────────────────────────────────────────────────────
  const allClinics    = await storage.getAllClinics();
  const allInsurances = await storage.getAllInsurances();
  const allUsers      = await storage.getAllUsers();
  const clinicId    = record.clinicId ?? (clinic ? (allClinics.find(c => c.name === clinic)?.id ?? null) : null);
  const insuranceId = record.insuranceId ?? (insurance ? (allInsurances.find(i => i.name === insurance)?.id ?? null) : null);
  const assignedUserId = assignedTo
    ? (allUsers.find(u => u.fullName.trim().toLowerCase() === assignedTo.trim().toLowerCase())?.id ?? null)
    : null;

  let newRecordId: number | null = null;
  let targetType: string | null = null;

  switch (outcome) {
    case "Send to Verification": {
      const task = await storage.createTask({
        patientName,
        clinicId,
        insuranceId,
        chartNumber,
        ieDate,
        doa,
        resolutionDate,
        assignedUserId,
        priority: "low",
        status: "unassigned",
        bucket: "for_verification",
        notes: combinedNotes,
        rtp: false,
      });
      newRecordId = task.id;
      targetType = "task";
      break;
    }
    case "Send to Billing": {
      const task = await storage.createTask({
        patientName,
        clinicId,
        insuranceId,
        chartNumber,
        ieDate,
        doa,
        resolutionDate,
        assignedUserId,
        priority: "low",
        status: "unassigned",
        bucket: "ready_for_billing",
        dueDate,
        notes: combinedNotes,
        rtp: false,
      });
      newRecordId = task.id;
      targetType = "task";
      const billingNotifyRoles = ["admin", "manager", "account_manager", "case_manager", "biller"];
      const billingNotifyUsers = allUsers.filter(u => billingNotifyRoles.includes(u.role) && u.active !== false);
      for (const u of billingNotifyUsers) {
        await storage.createNotification({
          userId: u.id,
          taskId: task.id,
          message: `New billing task arrived: ${patientName} — ready to be assigned`,
          read: false,
        });
      }
      break;
    }
    case "Send to Posting": {
      const posting = await storage.createPosting({
        patientName,
        clinic,
        insurance,
        amount,
        paid,
        assignedTo,
        fileNumber,
        documentType,
        scannedDate,
        postedDate,
        depositDate,
        status: "Unassigned",
        notes: combinedNotes,
      });
      newRecordId = posting.id;
      targetType = "posting";
      break;
    }
    case "Send to Collections": {
      const collection = await storage.createCollection({
        patientName,
        clinic,
        insurance,
        amount,
        paid,
        assignedTo,
        dosFrom,
        dosTo,
        inputDate,
        typeOfDenial,
        numberOfVisits,
        division,
        issueType,
        action,
        priority,
        status: "Unassigned",
        notes: combinedNotes,
      });
      newRecordId = collection.id;
      targetType = "collection";
      break;
    }
    case "Send to Denials": {
      const denial = await storage.createDenial({
        patientName,
        clinic,
        insurance,
        amount,
        paid,
        assignedTo,
        dosFrom,
        dosTo,
        doa,
        dateInput,
        dateOfLetter,
        effectiveDate,
        trialDate,
        typeOfDenial,
        numberOfDays,
        filedTo,
        arbStatus,
        arbPaymentStatus,
        amountReceived,
        checkedBy,
        intake,
        denialFileName,
        status: "Unassigned",
        comments: combinedNotes,
      });
      newRecordId = denial.id;
      targetType = "denial";
      break;
    }
    case "Send to Arbitration": {
      const arb = await storage.createArbitration({
        patientName,
        clinic,
        insurance,
        amount,
        paid,
        assignedTo,
        dosFrom,
        dosTo,
        doa,
        dateInput,
        dateOfLetter,
        effectiveDate,
        trialDate,
        typeOfDenial,
        numberOfDays,
        filedTo,
        arbStatus,
        arbPaymentStatus,
        amountReceived,
        checkedBy,
        intake,
        status: "Unassigned",
        comments: combinedNotes,
      });
      newRecordId = arb.id;
      targetType = "arbitration";
      break;
    }
    case "Send to RTP":
    case "Send to Closed": {
      const { activityHistory: _ah, ...recordWithoutHistory } = record;
      const closed = await storage.createClosed({
        patientName,
        clinic,
        insurance,
        amount,
        assignedTo: null,
        dosFrom,
        dosTo,
        numberOfVisits,
        priority,
        action,
        reason,
        regularVisit,
        fullVisit,
        reportedDate,
        source,
        sourceId: record.id ?? null,
        status: "Unassigned",
        notes: combinedNotes,
        recordData: JSON.stringify(recordWithoutHistory),
      });
      newRecordId = closed.id;
      targetType = "closed";
      break;
    }
  }

  if (newRecordId && targetType && record.activityHistory && record.activityHistory.length > 0) {
    const transferNote = `Transferred from ${source}`;
    switch (targetType) {
      case "task":
        await storage.createTaskActivity({ taskId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createTaskActivity({ taskId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
      case "denial":
        await storage.createDenialActivity({ denialId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createDenialActivity({ denialId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
      case "arbitration":
        await storage.createArbitrationActivity({ arbitrationId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createArbitrationActivity({ arbitrationId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
      case "collection":
        await storage.createCollectionActivity({ collectionId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createCollectionActivity({ collectionId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
      case "posting":
        await storage.createPostingActivity({ postingId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createPostingActivity({ postingId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
      case "closed":
        await storage.createClosedActivity({ closedId: newRecordId, userId, action: transferNote, field: "source", oldValue: source, newValue: outcome });
        for (const entry of record.activityHistory) {
          await storage.createClosedActivity({ closedId: newRecordId, userId, action: `[${source}] ${entry.action}`, field: entry.field, oldValue: entry.oldValue, newValue: entry.newValue });
        }
        break;
    }
  }
}

async function syncRTPRecord(source: string, sourceId: number, updatedRecord: any): Promise<void> {
  const { activityHistory: _ah, ...recordWithoutHistory } = updatedRecord;
  await storage.syncClosedFromSource(source, sourceId, {
    patientName: updatedRecord.patientName || "Unknown",
    clinic: updatedRecord.clinic || null,
    insurance: updatedRecord.insurance || null,
    amount: updatedRecord.amount || null,
    recordData: JSON.stringify(recordWithoutHistory),
  });
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    originalUserId?: number;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Ensure the session table exists without relying on connect-pg-simple's table.sql file
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: false,
      }),
      secret: process.env.SESSION_SECRET || "workflow-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  // New additive RCM administration endpoints; existing sessions remain authoritative.
  registerRcmAccessRoutes(app);
  registerRcmTaskboardRoutes(app);
  registerRcmTaskAssignmentRoutes(app);
  registerRcmApprovalRoutes(app);
  registerRcmProductivityRoutes(app);
  registerRcmLegacyAssignmentRoutes(app);
  registerRcmSlaRoutes(app);
  registerRcmQualityRoutes(app);

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      if (!user.active) {
        return res.status(403).json({ message: "Account deactivated" });
      }
      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      // Persist the new authenticated session BEFORE returning HTTP 200.
      // Without an explicit save, a client can issue its next request while
      // the PostgreSQL session store has not yet made the login available.
      // Avoid returning a successful login if the session write fails.
      req.session.save((saveError) => {
        if (saveError) {
          console.error("Login session persistence failed:", saveError);
          return res.status(503).json({ message: "Could not establish session; retry login" });
        }
        res.json(safeUser);
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    res.json({
      ...safeUser,
      isImpersonating: !!req.session.originalUserId,
      originalUserId: req.session.originalUserId ?? null,
    });
  });

  app.post("/api/admin/impersonate/stop", requireAuth, async (req, res) => {
    try {
      if (!req.session.originalUserId) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }
      const adminId = req.session.originalUserId;
      req.session.userId = adminId;
      delete req.session.originalUserId;
      const admin = await storage.getUser(adminId);
      if (!admin) return res.status(404).json({ message: "Admin user not found" });
      const { password: _, ...safeAdmin } = admin;
      res.json({ ...safeAdmin, isImpersonating: false, originalUserId: null });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/impersonate/:userId", requireAuth, async (req, res) => {
    try {
      const admin = await storage.getUser(req.session.userId!);
      if (!admin || admin.role !== "admin") {
        return res.status(403).json({ message: "Only admins can impersonate users" });
      }
      const targetId = parseInt(req.params.userId);
      if (isNaN(targetId)) return res.status(400).json({ message: "Invalid user id" });
      const target = await storage.getUser(targetId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.id === admin.id) return res.status(400).json({ message: "Cannot impersonate yourself" });
      req.session.originalUserId = admin.id;
      req.session.userId = target.id;
      const { password: _, ...safeTarget } = target;
      res.json({ ...safeTarget, isImpersonating: true, originalUserId: admin.id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!(await comparePasswords(currentPassword, user.password))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const hashed = await hashPassword(newPassword);
      await storage.updateUser(userId, { password: hashed });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/users", requireAuth, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(({ password: _, ...u }) => u));
  });

  const USER_MGMT_ROLES = ["admin", "manager", "account_manager", "case_manager"];
  app.post("/api/users", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !USER_MGMT_ROLES.includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { username: rawUsername, password, fullName: rawFullName, role } = req.body;
      const username = rawUsername?.trim();
      const fullName = rawFullName?.trim();
      if (!username || !password || !fullName) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashed, fullName, role: role || "verifier" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !USER_MGMT_ROLES.includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const id = parseInt(req.params.id);
      const updateData = { ...req.body };
      if (Object.hasOwn(updateData, "guidelineModuleAccess")) {
        return res.status(403).json({ message: "Use the admin-only module editor access control to change this permission" });
      }
      if (updateData.username) updateData.username = updateData.username.trim();
      if (updateData.fullName) updateData.fullName = updateData.fullName.trim();
      if (updateData.username) {
        const existing = await storage.getUserByUsername(updateData.username);
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "Username already exists" });
        }
      }
      if (updateData.password) {
        updateData.password = await hashPassword(updateData.password);
      }
      const user = await storage.updateUser(id, updateData);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !USER_MGMT_ROLES.includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const id = parseInt(req.params.id);
      const currentUser = (req as any).session?.userId;
      if (id === currentUser) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      await storage.deleteUser(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/clinics", requireAuth, async (_req, res) => {
    res.json(await storage.getAllClinics());
  });

  app.post("/api/clinics", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createClinic({ name }));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/clinics/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const clinic = await storage.updateClinic(parseInt(req.params.id), { name });
      if (!clinic) return res.status(404).json({ message: "Clinic not found" });
      res.json(clinic);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/clinics/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteClinic(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/insurances", requireAuth, async (_req, res) => {
    res.json(await storage.getAllInsurances());
  });

  app.post("/api/insurances", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createInsurance({ name }));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/insurances/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const ins = await storage.updateInsurance(parseInt(req.params.id), { name });
      if (!ins) return res.status(404).json({ message: "Insurance not found" });
      res.json(ins);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/insurances/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager", "account_manager", "case_manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      await storage.deleteInsurance(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/productivity", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || ["payment_specialist", "assigner"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Single task query covers both Verification and Billing.
      // Credit goes to the ASSIGNEE when status is set to Done/Verified/Billed.
      // Department is determined by bucket + status value in the merge step below.
      const [taskActs, denialActs, arbActs, collActs, postActs, checkActs, closedActs] = await Promise.all([
        db.select({
          id: taskActivity.id, recordId: taskActivity.taskId,
          userId: taskActivity.userId, action: taskActivity.action,
          timestamp: taskActivity.timestamp, userName: users.fullName,
          patientName: tasks.patientName, bucket: tasks.bucket,
          taskNewValue: taskActivity.newValue,
        }).from(taskActivity)
          .leftJoin(tasks, eq(taskActivity.taskId, tasks.id))
          .leftJoin(users, eq(users.id, taskActivity.userId))
          .where(and(inArray(taskActivity.field, ["status", "Status"]), inArray(taskActivity.newValue, ["billed", "done", "verified"])))
          .orderBy(desc(taskActivity.timestamp)),

        // Denials: credit goes to the assignee when status is set to Done
        db.select({
          id: denialActivity.id, recordId: denialActivity.denialId,
          userId: denialActivity.userId, action: denialActivity.action,
          timestamp: denialActivity.timestamp, userName: users.fullName, patientName: denials.patientName,
        }).from(denialActivity)
          .leftJoin(denials, eq(denialActivity.denialId, denials.id))
          .leftJoin(users, eq(users.id, denialActivity.userId))
          .where(and(eq(denialActivity.field, "status"), eq(denialActivity.newValue, "Done")))
          .orderBy(desc(denialActivity.timestamp)),

        // Arbitration: credit whoever set the status to Done (activity.userId — reliable ID join)
        db.select({
          id: arbitrationActivity.id, recordId: arbitrationActivity.arbitrationId,
          userId: arbitrationActivity.userId, action: arbitrationActivity.action,
          timestamp: arbitrationActivity.timestamp, userName: users.fullName, patientName: arbitrations.patientName,
        }).from(arbitrationActivity)
          .leftJoin(arbitrations, eq(arbitrationActivity.arbitrationId, arbitrations.id))
          .leftJoin(users, eq(users.id, arbitrationActivity.userId))
          .where(and(eq(arbitrationActivity.field, "status"), eq(arbitrationActivity.newValue, "Done")))
          .orderBy(desc(arbitrationActivity.timestamp)),

        // Collections: credit whoever set the status to Done (activity.userId — reliable ID join)
        db.select({
          id: collectionActivity.id, recordId: collectionActivity.collectionId,
          userId: collectionActivity.userId, action: collectionActivity.action,
          timestamp: collectionActivity.timestamp, userName: users.fullName, patientName: collections.patientName,
        }).from(collectionActivity)
          .leftJoin(collections, eq(collectionActivity.collectionId, collections.id))
          .leftJoin(users, eq(users.id, collectionActivity.userId))
          .where(and(eq(collectionActivity.field, "status"), eq(collectionActivity.newValue, "Done")))
          .orderBy(desc(collectionActivity.timestamp)),

        // Posting: credit whoever set the status to Done (activity.userId — reliable ID join)
        db.select({
          id: postingActivity.id, recordId: postingActivity.postingId,
          userId: postingActivity.userId, action: postingActivity.action,
          timestamp: postingActivity.timestamp, userName: users.fullName, patientName: postings.patientName,
        }).from(postingActivity)
          .leftJoin(postings, eq(postingActivity.postingId, postings.id))
          .leftJoin(users, eq(users.id, postingActivity.userId))
          .where(and(eq(postingActivity.field, "status"), eq(postingActivity.newValue, "Done")))
          .orderBy(desc(postingActivity.timestamp)),

        // Checks: credit whoever set the status to Done (activity.userId — reliable ID join)
        db.select({
          id: checkActivity.id, recordId: checkActivity.checkId,
          userId: checkActivity.userId, action: checkActivity.action,
          timestamp: checkActivity.timestamp, userName: users.fullName, patientName: checks.patientName,
        }).from(checkActivity)
          .leftJoin(checks, eq(checkActivity.checkId, checks.id))
          .leftJoin(users, eq(users.id, checkActivity.userId))
          .where(and(eq(checkActivity.field, "status"), eq(checkActivity.newValue, "Done")))
          .orderBy(desc(checkActivity.timestamp)),

        // Closed/RTP: credit whoever set the status to Done (activity.userId — reliable ID join)
        db.select({
          id: closedActivity.id, recordId: closedActivity.closedId,
          userId: closedActivity.userId, action: closedActivity.action,
          timestamp: closedActivity.timestamp, userName: users.fullName,
          patientName: closed.patientName, closedSource: closed.source,
        }).from(closedActivity)
          .leftJoin(closed, eq(closedActivity.closedId, closed.id))
          .leftJoin(users, eq(users.id, closedActivity.userId))
          .where(and(eq(closedActivity.field, "status"), eq(closedActivity.newValue, "Done")))
          .orderBy(desc(closedActivity.timestamp)),
      ]);

      // Merge and sort newest first
      const all = [
        ...taskActs.map(a => ({
          ...a,
          department: (a.bucket === "for_verification" || (a as any).taskNewValue === "verified") ? "Verification" : "Billing",
          bucket: undefined,
          taskNewValue: undefined,
        })),
        ...denialActs.map(a => ({ ...a, department: "Denials" })),
        ...arbActs.map(a => ({ ...a, department: "Arbitration" })),
        ...collActs.map(a => ({ ...a, department: "Collections" })),
        ...postActs.map(a => ({ ...a, department: "Posting" })),
        ...checkActs.map(a => ({ ...a, department: "Checks" })),
        ...closedActs.map(a => ({
          ...a,
          department: a.closedSource ? "RTP" : "Closed",
          closedSource: undefined,
        })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Deduplicate: for each record, only keep the most recent "Done" entry.
      // Since all[] is already sorted newest-first, the first occurrence of each
      // (department + recordId) pair is the correct one to count.
      const seen = new Set<string>();
      const deduped = all.filter(a => {
        const key = `${a.department}:${a.recordId ?? a.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      res.json(deduped);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/productivity/transfers", requireAuth, async (req, res) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer || viewer.active === false || !["admin", "manager", "account_manager", "case_manager"].includes(viewer.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(await getProductivityTransfers());
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/patient-overview", requireAuth, async (req, res) => {
    try {
      const viewer = await storage.getUser(req.session.userId!);
      if (!viewer || viewer.active === false) return res.status(401).json({ message: "Not authenticated" });
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      if (search.length > 100 || patientSearchTokens(search).join("").length < 2) {
        return res.status(400).json({ message: "Enter a patient name with at least 2 letters or numbers, up to 100 characters." });
      }
      // All signed-in roles may view matching records here. Original tracker
      // permissions still control opening/editing records on their own pages.
      const data = await searchPatientRecords(search);
      res.json(buildPatientOverview(search, data, viewer));
    } catch (error: any) {
      // Database errors may embed query parameters (patient names). Log only
      // the error class/code, never the search text or returned records.
      console.error("Patient overview search failed", { name: error?.name, code: error?.code || error?.cause?.code });
      res.status(500).json({ message: "Unable to search patient records. Please try again." });
    }
  });

  // Legacy Verification/Billing routes must enforce the same RCM scope as
  // /api/rcm/taskboard. A client-supplied workload flag never grants access.
  // Historical 'done' tasks are displayed in the Billing department by the board.
  const legacyTaskScope = (task: { clinicId: number | null; bucket: string | null }) =>
    task.clinicId == null ? null : {
      clinicId: Number(task.clinicId),
      departmentId: task.bucket === "for_verification" ? "Verification" : "Billing",
    };

  app.get("/api/tasks", requireAuth, async (req, res, next) => {
    try {
      const access = await resolveRcmAccess(req.session.userId!);
      if (!access) return res.status(403).json({ message: "Task access denied" });
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(403).json({ message: "Task access denied" });
      const allTasks = await storage.getAllTasks();
      const scoped = allTasks.filter(task => {
        const scope = legacyTaskScope(task);
        return !!scope && resourceAllowed(access.context, "tasks.read", scope);
      });
      // Retain older per-assignee behavior for billers and verifiers.
      // Workload mode can show all tasks within the authorized scope only.
      const isWorkload = req.query.workload === "true";
      const visible = !isWorkload && (user.role === "verifier" || user.role === "biller")
        ? scoped.filter(t => t.assignedUserId === user.id) : scoped;
      res.setHeader("Cache-Control", "private, no-store");
      res.json(visible);
    } catch (error) { next(error); }
  });

  // These legacy mutations share the same clinic/department boundary as
  // the new RCM APIs. All assignment changes must use the independent
  // approval-gated RCM assignment endpoint, never these legacy handlers.
  async function mayActOnLegacyTask(userId: number, task: { clinicId: number | null; bucket: string | null }, permission: "tasks.create" | "tasks.update" | "tasks.close") {
    const scope = legacyTaskScope(task);
    if (!scope) return false;
    const access = await resolveRcmAccess(userId);
    return !!access && resourceAllowed(access.context, permission, scope);
  }

  // Legacy Denials/Checks clinic names are text. Resolve only a unique,
  // normalized clinic name to an existing clinic ID, then enforce department
  // and record-level permissions. Ambiguous/unknown names fail closed.
  async function legacyClinicNameIds() {
    const rows = await pool.query(
      "SELECT lower(btrim(name)) AS name, min(id)::int AS id FROM clinics GROUP BY lower(btrim(name)) HAVING count(*)=1"
    );
    return new Map<string,number>(rows.rows.map(row => [String(row.name),Number(row.id)]));
  }
  function scopedLegacyRecord(
    context: NonNullable<Awaited<ReturnType<typeof resolveRcmAccess>>>["context"],
    clinicIds: Map<string,number>, clinic: string | null | undefined,
    department: "Denials" | "Checks", permission: "tasks.read" | "checks.read"
  ) {
    const key = typeof clinic === "string" ? clinic.trim().toLowerCase() : "";
    const clinicId = key ? clinicIds.get(key) : undefined;
    return clinicId !== undefined && resourceAllowed(context,permission,{clinicId,departmentId:department});
  }

  const createTaskSchema = z.object({
    patientName: z.string().min(1, "Patient name is required"),
    chartNumber: z.string().nullable().optional(),
    clinicId: z.number().nullable().optional(),
    insuranceId: z.number().nullable().optional(),
    assignedUserId: z.number().nullable().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).default("low"),
    status: z.enum(["working_on_it", "billed", "done", "dropped", "assigned", "unassigned", "verified"]).optional(),
    bucket: z.enum(["for_verification", "ready_for_billing", "done"]).default("for_verification"),
    dueDate: z.string().nullable().optional(),
    ieDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    outcome: z.string().nullable().optional(),
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getUser(req.session.userId!);
      if (!creator || !ADMIN_ROLES.includes(creator.role)) {
        return res.status(403).json({ message: "Only admins and case coordinators can create tasks" });
      }
      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
      }
      // No implicit broadening via missing clinic, or direct assignee writes.
      if (req.session.originalUserId) return res.status(403).json({ message: "Task changes disabled during impersonation" });
      if (parsed.data.assignedUserId != null) return res.status(403).json({ message: "Use the authorized RCM task assignment workflow" });
      if (!await mayActOnLegacyTask(req.session.userId!, parsed.data as { clinicId: number | null; bucket: string | null }, "tasks.create")) {
        return res.status(403).json({ message: "Not authorized for this clinic and department" });
      }
      const data: any = { ...parsed.data };
      data.uploaderId = req.session.userId;
      if (data.ieDate) {
        data.ieDate = new Date(data.ieDate + "T12:00:00");
        const due = new Date(data.ieDate);
        due.setDate(due.getDate() + 30);
        data.dueDate = due;
      } else {
        data.ieDate = null;
        data.dueDate = null;
      }
      if (data.assignedUserId) {
        data.status = "assigned";
      } else {
        data.status = "unassigned";
        data.assignedUserId = null;
      }
      const task = await storage.createTask(data);

      await storage.createTaskActivity({
        taskId: task.id,
        userId: req.session.userId!,
        action: "Task created",
        field: null,
        oldValue: null,
        newValue: null,
      });

      if (data.assignedUserId) {
        await storage.createNotification({
          userId: data.assignedUserId,
          taskId: task.id,
          message: `You have been assigned to task: ${data.patientName}`,
          read: false,
        });
      }

      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getTask(id);
      if (!existing) return res.status(404).json({ message: "Task not found" });
      if (req.session.originalUserId) return res.status(403).json({ message: "Task changes disabled during impersonation" });
      if (!await mayActOnLegacyTask(req.session.userId!, existing, "tasks.update")) {
        return res.status(404).json({ message: "Task not found" });
      }
      // Disallow clinic/bucket/assignee moves through the unreviewed legacy
      // update path. The scoped RCM endpoint validates eligible assignees,
      // optimistic concurrency and independent high-risk approval.
      if (Object.hasOwn(req.body ?? {}, "assignedUserId") || Object.hasOwn(req.body ?? {}, "clinicId") ||
          Object.hasOwn(req.body ?? {}, "bucket") || Object.hasOwn(req.body ?? {}, "outcome")) {
        return res.status(403).json({ message: "Assignment, clinic, bucket and outcome transfers require a scoped workflow" });
      }

      const updates = { ...req.body };
      const editor = await storage.getUser(req.session.userId!);
      if (updates.assignedUserId !== undefined && editor && !ADMIN_ROLES.includes(editor.role)) {
        delete updates.assignedUserId;
      }
      if (updates.doa !== undefined) {
        updates.doa = updates.doa ? new Date(updates.doa + "T12:00:00") : null;
      }
      if (updates.resolutionDate !== undefined) {
        updates.resolutionDate = updates.resolutionDate ? new Date(updates.resolutionDate + "T12:00:00") : null;
      }
      if (updates.ieDate !== undefined) {
        if (updates.ieDate) {
          updates.ieDate = new Date(updates.ieDate + "T12:00:00");
          const due = new Date(updates.ieDate);
          due.setDate(due.getDate() + 30);
          updates.dueDate = due;
        } else {
          updates.ieDate = null;
          updates.dueDate = null;
        }
      }

      if (updates.status === "billed" && existing.bucket === "ready_for_billing") {
        updates.bucket = "done";
      }

      if (updates.assignedUserId !== undefined && updates.status === undefined) {
        if (updates.assignedUserId && !existing.assignedUserId) {
          updates.status = "assigned";
        } else if (!updates.assignedUserId && existing.assignedUserId) {
          updates.status = "unassigned";
        }
      }

      const SEND_TO_OUTCOMES = [
        "Send to Verification", "Send to Billing", "Send to Posting", "Send to Collections",
        "Send to Denials", "Send to Arbitration", "Send to RTP", "Send to Closed",
      ];
      if (updates.outcome && OUTCOME_OPTIONS.includes(updates.outcome) && updates.outcome !== existing.outcome) {
        // Transfer the effective task, including edits and recalculated dates from this save.
        const transferRecord = { ...existing, ...updates };
        const clinicName = transferRecord.clinicId ? (await storage.getAllClinics()).find(c => c.id === transferRecord.clinicId)?.name : null;
        const insuranceName = transferRecord.insuranceId ? (await storage.getAllInsurances()).find(i => i.id === transferRecord.insuranceId)?.name : null;
        const taskActivityHistory = await storage.getTaskActivity(id);
        await handleOutcomeTransfer(updates.outcome, "Verification/Billing", {
          ...transferRecord,
          clinic: clinicName || null,
          insurance: insuranceName || null,
          amount: null,
          notes: transferRecord.notes,
          activityHistory: taskActivityHistory.map(a => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
        if (SEND_TO_OUTCOMES.includes(updates.outcome)) {
          updates.status = "done";
        }
      }

      const [allClinicsForLog, allInsurancesForLog, allUsersForLog] = await Promise.all([
        storage.getAllClinics(),
        storage.getAllInsurances(),
        storage.getAllUsers(),
      ]);
      const clinicName = (id: any) => allClinicsForLog.find(c => c.id === Number(id))?.name || String(id ?? "");
      const insuranceName = (id: any) => allInsurancesForLog.find(i => i.id === Number(id))?.name || String(id ?? "");
      const userName = (id: any) => allUsersForLog.find(u => u.id === Number(id))?.fullName || String(id ?? "");

      const fieldsToTrack = ["patientName", "chartNumber", "clinicId", "insuranceId", "assignedUserId", "priority", "status", "bucket", "dueDate", "ieDate", "rtp", "resolutionDate", "outcome", "activity"];
      const TASK_DONE_STATUSES = ["done", "billed", "verified"];
      for (const field of fieldsToTrack) {
        if (updates[field] !== undefined && String(updates[field]) !== String((existing as any)[field])) {
          let activityUserId = req.session.userId!;
          if (field === "status" && TASK_DONE_STATUSES.includes(String(updates[field]))) {
            const assignedId = updates.assignedUserId ?? existing.assignedUserId;
            if (assignedId) activityUserId = assignedId;
          }
          const oldRaw = (existing as any)[field];
          const newRaw = updates[field];
          let oldDisplay = String(oldRaw ?? "");
          let newDisplay = String(newRaw ?? "");
          const FIELD_LABELS: Record<string, string> = {
            patientName: "Patient Name", chartNumber: "Chart #", clinicId: "Clinic",
            insuranceId: "Insurance", assignedUserId: "Assigned To", priority: "Priority",
            status: "Status", bucket: "Bucket", dueDate: "Due Date", ieDate: "IE Date",
            rtp: "RTP", resolutionDate: "Resolution Date", outcome: "Outcome", activity: "Action",
          };
          if (field === "clinicId") { oldDisplay = oldRaw ? clinicName(oldRaw) : ""; newDisplay = newRaw ? clinicName(newRaw) : ""; }
          if (field === "insuranceId") { oldDisplay = oldRaw ? insuranceName(oldRaw) : ""; newDisplay = newRaw ? insuranceName(newRaw) : ""; }
          if (field === "assignedUserId") { oldDisplay = oldRaw ? userName(oldRaw) : ""; newDisplay = newRaw ? userName(newRaw) : ""; }
          const friendlyField = FIELD_LABELS[field] || field;
          await storage.createTaskActivity({
            taskId: id,
            userId: activityUserId,
            action: `Updated ${friendlyField}`,
            field: field,
            oldValue: oldDisplay || null,
            newValue: newDisplay || null,
          });
        }
      }

      if (updates.assignedUserId && updates.assignedUserId !== existing.assignedUserId) {
        await storage.createNotification({
          userId: updates.assignedUserId,
          taskId: id,
          message: `You have been assigned to task: ${existing.patientName}`,
          read: false,
        });
      }

      if (updates.bucket === "ready_for_billing" && existing.bucket !== "ready_for_billing") {
        const allUsers = await storage.getAllUsers();
        const adminsAndAssigners = allUsers.filter(u => ADMIN_ROLES.includes(u.role));
        for (const admin of adminsAndAssigners) {
          await storage.createNotification({
            userId: admin.id,
            taskId: id,
            message: `Task "${existing.patientName}" moved to Ready for Billing and needs a biller assigned`,
            read: false,
          });
        }
      }

      const task = await storage.updateTask(id, updates);
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete tasks" });
      }
      const id = parseInt(req.params.id);
      const existing = await storage.getTask(id);
      if (!existing) return res.status(404).json({ message: "Task not found" });
      if (req.session.originalUserId || !await mayActOnLegacyTask(req.session.userId!, existing, "tasks.close")) {
        return res.status(404).json({ message: "Task not found" });
      }
      await storage.deleteTask(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tasks/:id/notes", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { note } = req.body;
      if (!note) return res.status(400).json({ message: "Note required" });

      const existing = await storage.getTask(id);
      if (!existing) return res.status(404).json({ message: "Task not found" });
      if (req.session.originalUserId || !await mayActOnLegacyTask(req.session.userId!, existing, "tasks.update")) {
        return res.status(404).json({ message: "Task not found" });
      }

      const existingNotes = existing.notes || "";
      const user = await storage.getUser(req.session.userId!);
      const timestamp = new Date().toISOString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`
        : `[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`;

      await storage.updateTask(id, { notes: newNotes });
      await storage.createTaskActivity({
        taskId: id,
        userId: req.session.userId!,
        action: "Added note",
        field: "notes",
        oldValue: null,
        newValue: note,
      });

      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tasks/:taskId", requireAuth, async (req, res, next) => {
    try {
      const taskId = Number(req.params.taskId);
      if (!Number.isSafeInteger(taskId) || taskId < 1) return res.status(400).json({ message: "Invalid task ID" });
      const access = await resolveRcmAccess(req.session.userId!);
      if (!access) return res.status(403).json({ message: "Task access denied" });
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const scope = legacyTaskScope(task);
      if (!scope || !resourceAllowed(access.context, "tasks.read", scope)) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(task);
    } catch (error) { next(error); }
  });

  app.get("/api/tasks/:taskId/activity", requireAuth, async (req, res, next) => {
    try {
      const taskId = Number(req.params.taskId);
      if (!Number.isSafeInteger(taskId) || taskId < 1) return res.status(400).json({ message: "Invalid task ID" });
      const access = await resolveRcmAccess(req.session.userId!);
      if (!access) return res.status(403).json({ message: "Task access denied" });
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const scope = legacyTaskScope(task);
      if (!scope || !resourceAllowed(access.context, "tasks.read", scope)) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(await storage.getTaskActivity(taskId));
    } catch (error) { next(error); }
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    if (!req.session.userId) return res.json([]);
    res.json(await storage.getNotifications(req.session.userId));
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    const notif = await storage.getNotification(parseInt(req.params.id));
    if (!notif || notif.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await storage.markNotificationRead(parseInt(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    if (req.session.userId) {
      await storage.markAllNotificationsRead(req.session.userId);
    }
    res.json({ ok: true });
  });

  app.get("/api/denials", requireAuth, async (req, res, next) => {
    try {
      const access=await resolveRcmAccess(req.session.userId!);
      const user=await storage.getUser(req.session.userId!);
      if (!access || !user) return res.status(403).json({ message:"Denials access denied" });
      const clinicIds=await legacyClinicNameIds();
      const all=await storage.getAllDenials();
      const permitted=all.filter(d=>scopedLegacyRecord(access.context,clinicIds,d.clinic,"Denials","tasks.read"));
      // Preserve existing assignee filtering within authorized scope.
      // The workload query flag cannot widen clinic or department access.
      const isWorkload=req.query.workload==="true";
      const visible=!isWorkload && !ADMIN_ROLES.includes(user.role)
        ? permitted.filter(d=>d.assignedTo===user.fullName) : permitted;
      res.setHeader("Cache-Control","private, no-store");
      res.json(visible);
    } catch (error) { next(error); }
  });

  const denialFieldLabels: Record<string, string> = {
    paid: "PAID",
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment", assignedTo: "Assigned To",
    action: "Activity", status: "Status",
  };

  const denialTrackFields = Object.keys(denialFieldLabels);

  app.post("/api/denials", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const data: any = { ...req.body };
      const dateFields = ["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate"];
      for (const f of dateFields) {
        if (data[f]) {
          data[f] = new Date(data[f]);
        } else {
          data[f] = null;
        }
      }
      if (data.numberOfDays !== undefined && data.numberOfDays !== null) {
        data.numberOfDays = parseInt(data.numberOfDays) || null;
      }
      autoAssignStatus(data);
      const denial = await storage.createDenial(data);

      await storage.createDenialActivity({
        denialId: denial.id,
        userId: req.session.userId!,
        action: "Denial created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (data.status === "Done") {
        await storage.createDenialActivity({ denialId: denial.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }

      res.json(denial);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/denials/:id", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getDenial(id);
      if (!existing) return res.status(404).json({ message: "Denial not found" });
      const data: any = { ...req.body };
      const dateFields = ["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) {
          data[f] = data[f] ? new Date(data[f]) : null;
        }
      }
      if (data.numberOfDays !== undefined) {
        data.numberOfDays = data.numberOfDays ? parseInt(data.numberOfDays) : null;
      }

      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const denialActivityHistory = await storage.getDenialActivity(id);
        await handleOutcomeTransfer(data.outcome, "Denials", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          paid: data.paid ?? existing.paid,
          activityHistory: denialActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      autoAssignStatus(data, existing);
      const denialCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      const denialDateFields = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate"]);
      const normDenialDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      for (const field of [...denialTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = denialDateFields.has(field) ? normDenialDate((existing as any)[field]) : String((existing as any)[field] ?? "");
          const newVal = denialDateFields.has(field) ? normDenialDate(data[field]) : String(data[field] ?? "");
          if (oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (denialCreditId || req.session.userId!) : req.session.userId!;
            await storage.createDenialActivity({
              denialId: id,
              userId: activityUserId,
              action: `Updated ${denialFieldLabels[field] || field}`,
              field,
              oldValue: oldVal || null,
              newValue: newVal || null,
            });
          }
        }
      }

      const denial = await storage.updateDenial(id, data);
      if (denial && denial.outcome === "Send to RTP") await syncRTPRecord("Denials", id, denial);
      res.json(denial);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/denials/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set([...denialTrackFields, "patientLastName", "patientFirstName"].filter(k => k !== "outcome"));
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      if (data.numberOfDays !== undefined) {
        if (data.numberOfDays === null || data.numberOfDays === "") { data.numberOfDays = null; }
        else { const n = parseInt(String(data.numberOfDays), 10); if (isNaN(n)) return res.status(400).json({ message: "Invalid numberOfDays" }); data.numberOfDays = n; }
      }
      const norm = (v: any) => { if (v === null || v === undefined || v === "") return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getDenial(id);
        if (!existing) continue;
        const creditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
        const perRecord = { ...data };
        autoAssignStatus(perRecord, existing);
        await storage.updateDenial(id, perRecord);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = dateFields.has(field) ? norm(oldRaw) : String(oldRaw ?? "");
          const newVal = dateFields.has(field) ? norm(newRaw) : String(newRaw ?? "");
          if (newRaw !== undefined && oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (creditId || req.session.userId!) : req.session.userId!;
            await storage.createDenialActivity({ denialId: id, userId: activityUserId, action: `Updated ${denialFieldLabels[field] || field} (bulk)`, field, oldValue: oldVal || null, newValue: newVal || null });
          }
        }
        updated += 1;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/denials/:id", requireAuth, async (req, res, next) => {
    try {
      const id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:"Invalid Denial ID"});
      const access=await resolveRcmAccess(req.session.userId!);
      if(!access)return res.status(403).json({message:"Denials access denied"});
      const record=await storage.getDenial(id);
      if(!record)return res.status(404).json({message:"Denial not found"});
      const clinicIds=await legacyClinicNameIds();
      if(!scopedLegacyRecord(access.context,clinicIds,record.clinic,"Denials","tasks.read"))
        return res.status(404).json({message:"Denial not found"});
      res.setHeader("Cache-Control","private, no-store");
      res.json(record);
    }catch(error){next(error);}
  });

  app.get("/api/denials/:id/activity", requireAuth, async (req, res, next) => {
    try {
      const id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:"Invalid Denial ID"});
      const access=await resolveRcmAccess(req.session.userId!);
      if(!access)return res.status(403).json({message:"Denials access denied"});
      const record=await storage.getDenial(id);
      if(!record)return res.status(404).json({message:"Denial not found"});
      const clinicIds=await legacyClinicNameIds();
      if(!scopedLegacyRecord(access.context,clinicIds,record.clinic,"Denials","tasks.read"))
        return res.status(404).json({message:"Denial not found"});
      res.setHeader("Cache-Control","private, no-store");
      res.json(await storage.getDenialActivity(id));
    }catch(error){next(error);}
  });

  app.post("/api/denials/:id/send-to-arbitration", requireAuth, async (req, res) => {
    try {
      const denial = await storage.getDenial(parseInt(req.params.id));
      if (!denial) return res.status(404).json({ message: "Denial not found" });
      const arbData = {
        paid: denial.paid,
        denialFileName: denial.denialFileName,
        dateInput: denial.dateInput,
        intake: denial.intake,
        doa: denial.doa,
        clinic: denial.clinic,
        patientName: denial.patientName,
        insurance: denial.insurance,
        dateOfLetter: denial.dateOfLetter,
        typeOfDenial: denial.typeOfDenial,
        effectiveDate: denial.effectiveDate,
        dosFrom: denial.dosFrom,
        dosTo: denial.dosTo,
        numberOfDays: denial.numberOfDays,
        amount: denial.amount,
        comments: denial.comments,
        filedTo: denial.filedTo,
        arbStatus: denial.arbStatus,
        trialDate: denial.trialDate,
        arbPaymentStatus: denial.arbPaymentStatus,
        amountReceived: denial.amountReceived,
        checkedBy: denial.checkedBy,
        comment: denial.comment,
      };
      const result = await db.transaction(async (tx) => {
        const [arb] = await tx.insert(arbitrations).values(arbData).returning();
        await tx.insert(arbitrationActivity).values({
          arbitrationId: arb.id,
          userId: req.session.userId!,
          action: "Created from Denial",
        });
        await tx.delete(denialActivity).where(eq(denialActivity.denialId, denial.id));
        await tx.delete(denials).where(eq(denials.id, denial.id));
        return arb;
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/denials/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete denials" });
      }
      await storage.deleteDenial(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/denials/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deleteDenial(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Arbitration routes
  app.get("/api/arbitrations", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllArbitrations();
      const isWorkload = req.query.workload === "true";
      if (isWorkload || ADMIN_ROLES.includes(user.role)) {
        res.json(all);
      } else {
        res.json(all.filter(a => a.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const arbFieldLabels: Record<string, string> = {
    paid: "PAID",
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", filedDate: "Filed Date", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment", assignedTo: "Assigned To",
    activity: "Activity", status: "Status",
  };
  const arbTrackFields = Object.keys(arbFieldLabels);

  app.post("/api/arbitrations", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const data: any = { ...req.body };
      const dateFields = ["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate", "filedDate"];
      for (const f of dateFields) {
        if (data[f]) {
          data[f] = new Date(data[f]);
        } else {
          data[f] = null;
        }
        if (f === "filedDate" && data[f] && isNaN(data[f].getTime())) {
          return res.status(400).json({ message: "Invalid Filed Date" });
        }
      }
      if (data.numberOfDays !== undefined && data.numberOfDays !== null) {
        data.numberOfDays = parseInt(data.numberOfDays) || null;
      }
      autoAssignStatus(data);
      const arb = await storage.createArbitration(data);
      await storage.createArbitrationActivity({
        arbitrationId: arb.id,
        userId: req.session.userId!,
        action: "Arbitration created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (data.status === "Done") {
        await storage.createArbitrationActivity({ arbitrationId: arb.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }
      res.json(arb);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/arbitrations/:id", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getArbitration(id);
      if (!existing) return res.status(404).json({ message: "Arbitration not found" });
      const data: any = { ...req.body };
      const dateFields = ["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate", "filedDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) {
          data[f] = data[f] ? new Date(data[f]) : null;
          if (f === "filedDate" && data[f] && isNaN(data[f].getTime())) {
            return res.status(400).json({ message: "Invalid Filed Date" });
          }
        }
      }
      if (data.numberOfDays !== undefined) {
        data.numberOfDays = data.numberOfDays ? parseInt(data.numberOfDays) : null;
      }
      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const arbActivityHistory = await storage.getArbitrationActivity(id);
        await handleOutcomeTransfer(data.outcome, "Arbitration", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          paid: data.paid ?? existing.paid,
          activityHistory: arbActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const arbCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      autoAssignStatus(data, existing);
      const arbDateFields = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate", "filedDate"]);
      const normArbDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      for (const field of [...arbTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = arbDateFields.has(field) ? normArbDate((existing as any)[field]) : String((existing as any)[field] ?? "");
          const newVal = arbDateFields.has(field) ? normArbDate(data[field]) : String(data[field] ?? "");
          if (oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (arbCreditId || req.session.userId!) : req.session.userId!;
            await storage.createArbitrationActivity({
              arbitrationId: id,
              userId: activityUserId,
              action: `Updated ${arbFieldLabels[field] || field}`,
              field,
              oldValue: oldVal || null,
              newValue: newVal || null,
            });
          }
        }
      }
      const arb = await storage.updateArbitration(id, data);
      if (arb && arb.outcome === "Send to RTP") await syncRTPRecord("Arbitration", id, arb);
      res.json(arb);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/arbitrations/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set([...arbTrackFields, "patientLastName", "patientFirstName"].filter(k => k !== "outcome"));
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["dateInput", "doa", "dateOfLetter", "effectiveDate", "dosFrom", "dosTo", "trialDate", "filedDate"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      if (data.numberOfDays !== undefined) {
        if (data.numberOfDays === null || data.numberOfDays === "") { data.numberOfDays = null; }
        else { const n = parseInt(String(data.numberOfDays), 10); if (isNaN(n)) return res.status(400).json({ message: "Invalid numberOfDays" }); data.numberOfDays = n; }
      }
      const norm = (v: any) => { if (v === null || v === undefined || v === "") return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getArbitration(id);
        if (!existing) continue;
        const creditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
        const perRecord = { ...data };
        autoAssignStatus(perRecord, existing);
        await storage.updateArbitration(id, perRecord);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = dateFields.has(field) ? norm(oldRaw) : String(oldRaw ?? "");
          const newVal = dateFields.has(field) ? norm(newRaw) : String(newRaw ?? "");
          if (newRaw !== undefined && oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (creditId || req.session.userId!) : req.session.userId!;
            await storage.createArbitrationActivity({ arbitrationId: id, userId: activityUserId, action: `Updated ${arbFieldLabels[field] || field} (bulk)`, field, oldValue: oldVal || null, newValue: newVal || null });
          }
        }
        updated += 1;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/arbitrations/:id", requireAuth, async (req, res) => {
    const record = await storage.getArbitration(parseInt(req.params.id));
    if (!record) return res.status(404).json({ message: "Arbitration not found" });
    res.json(record);
  });

  app.get("/api/arbitrations/:id/activity", requireAuth, async (req, res) => {
    const arbId = parseInt(req.params.id);
    res.json(await storage.getArbitrationActivity(arbId));
  });

  app.delete("/api/arbitrations/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete arbitrations" });
      }
      await storage.deleteArbitration(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/arbitrations/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deleteArbitration(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Collections routes
  app.get("/api/collections", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllCollections();
      const isWorkload = req.query.workload === "true";
      if (isWorkload || ADMIN_ROLES.includes(user.role)) {
        res.json(all);
      } else {
        res.json(all.filter(c => c.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const collectionFieldLabels: Record<string, string> = {
    paid: "PAID",
    patientName: "Patient's Name", inputDate: "Input Date", clinic: "Clinic", division: "Division",
    insurance: "Insurance", dosFrom: "DOS From", dosTo: "DOS To", numberOfVisits: "# of Visits",
    amount: "Amount", issueType: "Issue Type", typeOfDenial: "Type of Denial", action: "Activity",
    outcome: "Outcome", priority: "Priority", assignedTo: "Assigned to", status: "Status",
  };
  const collectionTrackFields = Object.keys(collectionFieldLabels);

  app.post("/api/collections", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Only admins, managers, and case coordinators can create collections" });
      }
      const data: any = { ...req.body };
      const dateFields = ["inputDate", "dosFrom", "dosTo"];
      for (const f of dateFields) {
        if (data[f]) { data[f] = new Date(data[f]); } else { data[f] = null; }
      }
      if (data.numberOfVisits !== undefined && data.numberOfVisits !== null) {
        data.numberOfVisits = parseInt(data.numberOfVisits) || null;
      }
      autoAssignStatus(data);
      const collection = await storage.createCollection(data);
      await storage.createCollectionActivity({
        collectionId: collection.id,
        userId: req.session.userId!,
        action: "Collection created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (data.status === "Done") {
        await storage.createCollectionActivity({ collectionId: collection.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }
      res.json(collection);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/collections/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Only admins, managers, and case coordinators can import collections" });
      }
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }
      const dateFields = ["inputDate", "dosFrom", "dosTo"];
      const results: { success: number; updated: number; errors: string[] } = { success: 0, updated: 0, errors: [] };
      const existingCollections = await storage.getAllCollections();
      const allUsersCol = await storage.getAllUsers();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName || !data.patientName.trim()) {
            results.errors.push(`Row ${i + 1}: Patient Name is required`);
            continue;
          }
          for (const f of dateFields) {
            if (data[f]) { data[f] = new Date(data[f]); } else { data[f] = null; }
          }
          if (data.numberOfVisits !== undefined && data.numberOfVisits !== null && data.numberOfVisits !== "") {
            data.numberOfVisits = parseInt(data.numberOfVisits) || null;
          } else {
            data.numberOfVisits = null;
          }
          const match = existingCollections.find(c =>
            c.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() &&
            (c.clinic || "").toLowerCase().trim() === (data.clinic || "").toLowerCase().trim()
          );
          const colCreditId = allUsersCol.find(u => u.fullName?.toLowerCase() === (data.assignedTo || "").toLowerCase())?.id ?? req.session.userId!;
          if (match) {
            await storage.updateCollection(match.id, data);
            await storage.createCollectionActivity({ collectionId: match.id, userId: req.session.userId!, action: "Collection updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createCollectionActivity({ collectionId: match.id, userId: colCreditId, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const collection = await storage.createCollection(data);
            await storage.createCollectionActivity({ collectionId: collection.id, userId: req.session.userId!, action: "Collection created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createCollectionActivity({ collectionId: collection.id, userId: colCreditId, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) {
          results.errors.push(`Row ${i + 1}: ${e.message}`);
        }
      }
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Denials import-csv ───────────────────────────────────────────────────
  app.post("/api/denials/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const dateFields = ["inputDate", "dosFrom", "dosTo", "dateOfLetter", "trialDate", "effectiveDate"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllDenials();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          for (const f of dateFields) { data[f] = data[f] ? new Date(data[f]) : null; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => r.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() && (r.clinic || "").toLowerCase() === (data.clinic || "").toLowerCase());
          if (match) {
            await storage.updateDenial(match.id, data);
            await storage.createDenialActivity({ denialId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createDenialActivity({ denialId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const rec = await storage.createDenial(data);
            await storage.createDenialActivity({ denialId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createDenialActivity({ denialId: rec.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Arbitrations import-csv ──────────────────────────────────────────────
  app.post("/api/arbitrations/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const dateFields = ["inputDate", "dosFrom", "dosTo", "dateOfLetter", "trialDate", "effectiveDate", "filedDate"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllArbitrations();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          for (const f of dateFields) {
            if (f === "filedDate" && data[f] === undefined) continue;
            data[f] = data[f] ? new Date(data[f]) : null;
          }
          if (data.filedDate && isNaN(data.filedDate.getTime())) throw new Error("Invalid Filed Date");
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => r.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() && (r.clinic || "").toLowerCase() === (data.clinic || "").toLowerCase());
          if (match) {
            await storage.updateArbitration(match.id, data);
            await storage.createArbitrationActivity({ arbitrationId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createArbitrationActivity({ arbitrationId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const rec = await storage.createArbitration(data);
            await storage.createArbitrationActivity({ arbitrationId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createArbitrationActivity({ arbitrationId: rec.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Postings import-csv ──────────────────────────────────────────────────
  app.post("/api/postings/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const dateFields = ["scannedDate", "depositDate"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllPostings();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim() && !data.fileNumber?.trim()) { results.errors.push(`Row ${i + 1}: File # or Patient Name required`); continue; }
          for (const f of dateFields) { data[f] = data[f] ? new Date(data[f]) : null; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => (r.patientName || "").toLowerCase().trim() === (data.patientName || "").toLowerCase().trim() && (r.fileNumber || "").toLowerCase() === (data.fileNumber || "").toLowerCase());
          if (match) {
            await storage.updatePosting(match.id, data);
            await storage.createPostingActivity({ postingId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createPostingActivity({ postingId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const rec = await storage.createPosting(data);
            await storage.createPostingActivity({ postingId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createPostingActivity({ postingId: rec.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Checks import-csv ────────────────────────────────────────────────────
  app.post("/api/checks/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const dateFields = ["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllChecks();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          for (const f of dateFields) { data[f] = data[f] ? new Date(data[f]) : null; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r =>
            data.checkNumber && (r.checkNumber || "").toLowerCase() === (data.checkNumber || "").toLowerCase() &&
            (r.clinic || "").toLowerCase() === (data.clinic || "").toLowerCase()
          );
          if (match) {
            await storage.updateCheck(match.id, data);
            await storage.createCheckActivity({ checkId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createCheckActivity({ checkId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const rec = await storage.createCheck(data);
            await storage.createCheckActivity({ checkId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createCheckActivity({ checkId: rec.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Closed import-csv ────────────────────────────────────────────────────
  app.post("/api/closed/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllClosed();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => r.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() && (r.clinic || "").toLowerCase() === (data.clinic || "").toLowerCase());
          if (match) {
            await storage.updateClosed(match.id, data);
            await storage.createClosedActivity({ closedId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done" && match.status !== "Done") {
              await storage.createClosedActivity({ closedId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: "Done" });
            }
            results.updated++;
          } else {
            const rec = await storage.createClosed(data);
            await storage.createClosedActivity({ closedId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status === "Done") {
              await storage.createClosedActivity({ closedId: rec.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: "Done" });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Tasks import-csv (verification + billing) ────────────────────────────
  app.post("/api/tasks/import-csv", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: "Access denied" });
      const { rows, bucket } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No rows provided" });
      const allClinics = await storage.getAllClinics();
      const allInsurances = await storage.getAllInsurances();
      const allUsers = await storage.getAllUsers();
      const allTasks = await storage.getAllTasks();
      const targetBucket = bucket || "for_verification";
      const dateFields = ["inputDate", "ieDate", "dueDate", "resolutionDate", "doa"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          for (const f of dateFields) {
            if (f === "inputDate") {
              data[f] = data[f] ? new Date(data[f]) : new Date();
            } else {
              data[f] = data[f] ? new Date(data[f]) : null;
            }
          }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");

          // Resolve clinic name → clinicId
          const clinicName = data.clinic || "";
          if (clinicName) {
            const cl = allClinics.find(c => c.name.toLowerCase() === clinicName.toLowerCase());
            data.clinicId = cl?.id || null;
          } else {
            data.clinicId = data.clinicId || null;
          }
          delete data.clinic;

          // Resolve insurance name → insuranceId
          const insuranceName = data.insurance || "";
          if (insuranceName) {
            const ins = allInsurances.find(ins => ins.name.toLowerCase() === insuranceName.toLowerCase());
            data.insuranceId = ins?.id || null;
          } else {
            data.insuranceId = data.insuranceId || null;
          }
          delete data.insurance;

          // Resolve assignedTo (name/username) → assignedUserId
          const assignedName = data.assignedTo || "";
          delete data.assignedTo;
          if (assignedName) {
            const nameLower = assignedName.toLowerCase().trim();
            const matchedUser = allUsers.find(u =>
              `${u.firstName} ${u.lastName}`.toLowerCase() === nameLower ||
              u.username.toLowerCase() === nameLower
            );
            data.assignedUserId = matchedUser?.id || null;
          } else {
            data.assignedUserId = data.assignedUserId || null;
          }

          if (!data.status) data.status = "unassigned";
          if (!data.priority) data.priority = "low";
          data.bucket = targetBucket;

          // Duplicate check: patientName + chartNumber + bucket (most specific);
          // fall back to patientName + clinicId + bucket if no chartNumber
          const patLower = data.patientName.toLowerCase().trim();
          const hasChart = !!(data.chartNumber || "").trim();
          const match = allTasks.find(t => {
            if (t.patientName?.toLowerCase().trim() !== patLower) return false;
            if (t.bucket !== targetBucket) return false;
            if (hasChart) return (t.chartNumber || "").toLowerCase().trim() === (data.chartNumber || "").toLowerCase().trim();
            return t.clinicId === data.clinicId;
          });

          const DONE_STATUSES = ["done", "billed", "verified"];
          if (match) {
            await storage.updateTask(match.id, data);
            await storage.createTaskActivity({ taskId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status && DONE_STATUSES.includes(data.status) && !DONE_STATUSES.includes(match.status || "")) {
              await storage.createTaskActivity({ taskId: match.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: match.status || null, newValue: data.status });
            }
            results.updated++;
          } else {
            const task = await storage.createTask({ ...data, uploaderId: req.session.userId! });
            await storage.createTaskActivity({ taskId: task.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            if (data.status && DONE_STATUSES.includes(data.status)) {
              await storage.createTaskActivity({ taskId: task.id, userId: req.session.userId!, action: "Status → Done (CSV import)", field: "status", oldValue: null, newValue: data.status });
            }
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/collections/:id", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Only admins, managers, and case coordinators can edit collections" });
      }
      const id = parseInt(req.params.id);
      const existing = await storage.getCollection(id);
      if (!existing) return res.status(404).json({ message: "Collection not found" });
      const data: any = { ...req.body };
      const dateFields = ["inputDate", "dosFrom", "dosTo"];
      for (const f of dateFields) {
        if (data[f] !== undefined) { data[f] = data[f] ? new Date(data[f]) : null; }
      }
      if (data.numberOfVisits !== undefined) {
        data.numberOfVisits = data.numberOfVisits ? parseInt(data.numberOfVisits) : null;
      }
      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const collActivityHistory = await storage.getCollectionActivity(id);
        await handleOutcomeTransfer(data.outcome, "Collections", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          paid: data.paid ?? existing.paid,
          activityHistory: collActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const collCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      const collDateFields = new Set(["inputDate", "dosFrom", "dosTo"]);
      const normalizeCollDate = (v: any) => {
        if (!v) return "";
        try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); }
      };
      for (const field of [...collectionTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = collDateFields.has(field) ? normalizeCollDate((existing as any)[field]) : String((existing as any)[field] ?? "");
          const newVal = collDateFields.has(field) ? normalizeCollDate(data[field]) : String(data[field] ?? "");
          if (oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (collCreditId || req.session.userId!) : req.session.userId!;
            await storage.createCollectionActivity({
              collectionId: id,
              userId: activityUserId,
              action: `Updated ${collectionFieldLabels[field] || field}`,
              field,
              oldValue: oldVal || null,
              newValue: newVal || null,
            });
          }
        }
      }
      autoAssignStatus(data, existing);
      const collection = await storage.updateCollection(id, data);
      if (collection && collection.outcome === "Send to RTP") await syncRTPRecord("Collections", id, collection);
      res.json(collection);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/collections/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set([...collectionTrackFields, "patientLastName", "patientFirstName"].filter(k => k !== "outcome"));
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["inputDate", "dosFrom", "dosTo"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      if (data.numberOfVisits !== undefined) {
        if (data.numberOfVisits === null || data.numberOfVisits === "") { data.numberOfVisits = null; }
        else { const n = parseInt(String(data.numberOfVisits), 10); if (isNaN(n)) return res.status(400).json({ message: "Invalid numberOfVisits" }); data.numberOfVisits = n; }
      }
      const norm = (v: any) => { if (v === null || v === undefined || v === "") return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getCollection(id);
        if (!existing) continue;
        const creditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
        const perRecord = { ...data };
        autoAssignStatus(perRecord, existing);
        await storage.updateCollection(id, perRecord);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = dateFields.has(field) ? norm(oldRaw) : String(oldRaw ?? "");
          const newVal = dateFields.has(field) ? norm(newRaw) : String(newRaw ?? "");
          if (newRaw !== undefined && oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (creditId || req.session.userId!) : req.session.userId!;
            await storage.createCollectionActivity({ collectionId: id, userId: activityUserId, action: `Updated ${collectionFieldLabels[field] || field} (bulk)`, field, oldValue: oldVal || null, newValue: newVal || null });
          }
        }
        updated += 1;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/collections/:id", requireAuth, async (req, res) => {
    const record = await storage.getCollection(parseInt(req.params.id));
    if (!record) return res.status(404).json({ message: "Collection not found" });
    res.json(record);
  });

  app.get("/api/collections/:id/activity", requireAuth, async (req, res) => {
    const collectionId = parseInt(req.params.id);
    res.json(await storage.getCollectionActivity(collectionId));
  });

  app.post("/api/collections/:id/notes", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { note } = req.body;
      if (!note) return res.status(400).json({ message: "Note required" });
      const existing = await storage.getCollection(id);
      if (!existing) return res.status(404).json({ message: "Collection not found" });
      const existingNotes = existing.notes || "";
      const user = await storage.getUser(req.session.userId!);
      const timestamp = new Date().toISOString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`
        : `[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`;
      await storage.updateCollection(id, { notes: newNotes });
      await storage.createCollectionActivity({
        collectionId: id,
        userId: req.session.userId!,
        action: "Added note",
        field: "notes",
        oldValue: null,
        newValue: note,
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/collections/remove-duplicates", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can remove duplicates" });
      }
      const all = await storage.getAllCollections();
      const seen = new Map<string, number>();
      let removed = 0;
      const sorted = [...all].sort((a, b) => {
        const aHasData = [a.amount, a.assignedTo, a.insurance, a.dosFrom, a.dosTo].filter(Boolean).length;
        const bHasData = [b.amount, b.assignedTo, b.insurance, b.dosFrom, b.dosTo].filter(Boolean).length;
        return bHasData - aHasData;
      });
      for (const c of sorted) {
        const key = `${(c.patientName || "").toLowerCase().trim()}|${(c.clinic || "").toLowerCase().trim()}`;
        if (seen.has(key)) {
          await storage.deleteCollection(c.id);
          removed++;
        } else {
          seen.set(key, c.id);
        }
      }
      res.json({ removed });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/collections/fix-assigned", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can fix assignments" });
      }
      const all = await storage.getAllCollections();
      const allUsers = await storage.getAllUsers();
      const userNameMap = new Map<string, string>();
      for (const u of allUsers) {
        userNameMap.set(u.fullName.replace(/\s+/g, ' ').trim().toLowerCase(), u.fullName);
      }
      let fixed = 0;
      for (const c of all) {
        if (!c.assignedTo) continue;
        const normalized = c.assignedTo.replace(/\s+/g, ' ').trim();
        const key = normalized.toLowerCase();
        const matchedName = userNameMap.get(key);
        if (matchedName && matchedName !== c.assignedTo) {
          await storage.updateCollection(c.id, { assignedTo: matchedName });
          fixed++;
        }
      }
      res.json({ fixed });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/collections/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete collections" });
      }
      await storage.deleteCollection(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/collections/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deleteCollection(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Postings
  const PAYMENT_DOC_ROLES = ["admin", "payment_specialist", "account_manager", "case_manager", "manager"];

  app.get("/api/postings", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllPostings();
      const isWorkload = req.query.workload === "true";
      if (isWorkload) {
        res.json(all);
        return;
      }
      const canSeePaymentDocs = PAYMENT_DOC_ROLES.includes(user.role);
      const visibleByDocType = canSeePaymentDocs
        ? all
        : all.filter(p => (p.documentType || "").toLowerCase() !== "payment");
      if (ADMIN_ROLES.includes(user.role)) {
        res.json(visibleByDocType);
      } else {
        res.json(visibleByDocType.filter(p => p.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/postings", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Only admins, managers, and case coordinators can create postings" });
      }
      const data: any = { ...req.body };
      const dateFields = ["scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f]) { data[f] = new Date(data[f]); } else { data[f] = null; }
      }
      autoAssignStatus(data);
      const posting = await storage.createPosting(data);
      await storage.createPostingActivity({
        postingId: posting.id,
        userId: req.session.userId!,
        action: "Posting created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (data.status === "Done") {
        await storage.createPostingActivity({ postingId: posting.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }
      res.json(posting);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/postings/:id", requireAuth, validatePaidFlag, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Only admins, managers, and case coordinators can edit postings" });
      }
      const id = parseInt(req.params.id);
      const existing = await storage.getPosting(id);
      if (!existing) return res.status(404).json({ message: "Posting not found" });
      const data: any = { ...req.body };
      const dateFields = ["scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) { data[f] = data[f] ? new Date(data[f]) : null; }
      }
      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const postingActivityHistory = await storage.getPostingActivity(id);
        await handleOutcomeTransfer(data.outcome, "Posting", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          paid: data.paid ?? existing.paid,
          activityHistory: postingActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const postingCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      const postingDateFields = new Set(["scannedDate", "postedDate"]);
      const normPostingDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      const trackFields = ["fileNumber", "clinic", "documentType", "priority", "assignedTo", "status", "scannedDate", "postedDate", "amount", "outcome", "activity", "paid"];
      for (const field of trackFields) {
        const oldRaw = (existing as any)[field];
        const newRaw = data[field];
        const oldVal = field === "paid" ? String(oldRaw === true) : postingDateFields.has(field) ? normPostingDate(oldRaw) : String(oldRaw || "");
        const newVal = field === "paid" ? String(newRaw === true) : postingDateFields.has(field) ? normPostingDate(newRaw) : String(newRaw || "");
        if (newRaw !== undefined && oldVal !== newVal) {
          const activityUserId = (field === "status" && String(newVal) === "Done") ? (postingCreditId || req.session.userId!) : req.session.userId!;
          await storage.createPostingActivity({
            postingId: id,
            userId: activityUserId,
            action: field === "paid" ? (newRaw ? "Marked PAID" : "Unmarked PAID") : `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
      autoAssignStatus(data, existing);
      const updated = await storage.updatePosting(id, data);
      if (updated && updated.outcome === "Send to RTP") await syncRTPRecord("Posting", id, updated);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/postings/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set(["fileNumber", "clinic", "documentType", "priority", "assignedTo", "status", "scannedDate", "postedDate", "amount", "activity", "depositDate", "depositedBy", "patientName", "insurance"]);
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["scannedDate", "postedDate", "depositDate"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      const norm = (v: any) => { if (v === null || v === undefined || v === "") return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getPosting(id);
        if (!existing) continue;
        const creditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
        const perRecord = { ...data };
        autoAssignStatus(perRecord, existing);
        await storage.updatePosting(id, perRecord);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = dateFields.has(field) ? norm(oldRaw) : String(oldRaw ?? "");
          const newVal = dateFields.has(field) ? norm(newRaw) : String(newRaw ?? "");
          if (newRaw !== undefined && oldVal !== newVal) {
            const activityUserId = (field === "status" && newVal === "Done") ? (creditId || req.session.userId!) : req.session.userId!;
            await storage.createPostingActivity({ postingId: id, userId: activityUserId, action: `Changed ${field} (bulk)`, field, oldValue: oldVal || null, newValue: newVal || null });
          }
        }
        updated += 1;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/postings/:id", requireAuth, async (req, res) => {
    const record = await storage.getPosting(parseInt(req.params.id));
    if (!record) return res.status(404).json({ message: "Posting not found" });
    res.json(record);
  });

  app.get("/api/postings/:id/activity", requireAuth, async (req, res) => {
    const activity = await storage.getPostingActivity(parseInt(req.params.id));
    res.json(activity);
  });

  app.post("/api/postings/:id/notes", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { note } = req.body;
      if (!note) return res.status(400).json({ message: "Note required" });
      const existing = await storage.getPosting(id);
      if (!existing) return res.status(404).json({ message: "Posting not found" });
      const existingNotes = existing.notes || "";
      const user = await storage.getUser(req.session.userId!);
      const timestamp = new Date().toISOString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`
        : `[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`;
      await storage.updatePosting(id, { notes: newNotes });
      await storage.createPostingActivity({
        postingId: id,
        userId: req.session.userId!,
        action: "Added note",
        field: "notes",
        oldValue: null,
        newValue: note,
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/postings/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete postings" });
      }
      await storage.deletePosting(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/postings/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deletePosting(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Announcements / Message Board
  registerGuidelineBoardRoutes(app, { storage, requireAuth, upload, saveUploadedFiles });
  registerMedicalRecordsRoutes(app, { storage, requireAuth, repository: medicalRecordsRepository, ensureHistory: ensureMedicalRecordsHistory });

  app.get("/api/announcements/unread-count", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllAnnouncements();
      const visible = all.filter(a => {
        if (a.targetType === "all") return true;
        if (a.targetType === "role" && a.targetRoles) return a.targetRoles.includes(user.role);
        if (a.targetType === "users" && a.targetUserIds) return a.targetUserIds.includes(user.id) || a.authorId === user.id;
        return false;
      });
      const unread = visible.filter(a => !a.acks.some((ak: any) => ak.userId === user.id));
      res.json({ count: unread.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/announcements", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllAnnouncements();
      const visible = all.filter(a => {
        if (a.targetType === "all") return true;
        if (a.targetType === "role" && a.targetRoles) return a.targetRoles.includes(user.role);
        if (a.targetType === "users" && a.targetUserIds) return a.targetUserIds.includes(user.id) || a.authorId === user.id;
        return false;
      });
      if (["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        res.json(all);
      } else {
        res.json(visible);
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/announcements", requireAuth, upload.array("attachments"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can create announcements" });
      }
      const { title, body, targetType, targetRoles, targetUserIds } = req.body;
      if (!title || !body || !targetType) {
        return res.status(400).json({ message: "Title, body, and target type are required" });
      }
      const files = req.files as Express.Multer.File[] | undefined;
      const uploaded = files && files.length > 0 ? await saveUploadedFiles(files) : [];
      const parsedRoles = targetRoles ? (typeof targetRoles === "string" ? JSON.parse(targetRoles) : targetRoles) : null;
      const parsedUserIds = targetUserIds ? (typeof targetUserIds === "string" ? JSON.parse(targetUserIds) : targetUserIds) : null;
      const announcement = await storage.createAnnouncement({
        title,
        body,
        authorId: user.id,
        targetType,
        targetRoles: parsedRoles || null,
        targetUserIds: parsedUserIds || null,
        attachments: uploaded.length > 0 ? uploaded : null,
      });
      res.json(announcement);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/announcements/:id/ack", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllAnnouncements();
      const a = all.find(ann => ann.id === parseInt(req.params.id));
      if (!a) return res.status(404).json({ message: "Announcement not found" });
      const isRecipient = a.targetType === "all" ||
        (a.targetType === "role" && a.targetRoles?.includes(user.role)) ||
        (a.targetType === "users" && a.targetUserIds?.includes(user.id));
      if (!isRecipient) return res.status(403).json({ message: "Not a recipient of this announcement" });
      await storage.acknowledgeAnnouncement(a.id, user.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/announcements/:id/acks", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (!["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can view read receipts" });
      }
      const acks = await storage.getAnnouncementAcks(parseInt(req.params.id));
      res.json(acks);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/announcements/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete announcements" });
      }
      await storage.deleteAnnouncement(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Dropdown Options
  app.get("/api/dropdown-options", requireAuth, async (_req, res) => {
    try {
      const all = await storage.getAllDropdownOptions();
      res.json(all);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/dropdown-options/:category", requireAuth, async (req, res) => {
    try {
      const options = await storage.getDropdownOptionsByCategory(req.params.category);
      res.json(options);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/dropdown-options", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can manage dropdown options" });
      }
      const { category, value } = req.body;
      if (!category || !value || typeof category !== "string" || typeof value !== "string") {
        return res.status(400).json({ message: "category and value are required strings" });
      }
      const validCategories = DROPDOWN_CATEGORIES.map(c => c.key);
      if (!validCategories.includes(category)) {
        return res.status(400).json({ message: `Invalid category. Must be one of: ${validCategories.join(", ")}` });
      }
      if (["posting_document_type", "guideline_module_type"].includes(category) && (!value.trim() || value.trim().length > 200)) {
        return res.status(400).json({ message: "Type names must be between 1 and 200 characters" });
      }
      const opt = await storage.createDropdownOption({ category, value: value.trim(), sortOrder: req.body.sortOrder ?? 0 });
      res.json(opt);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/dropdown-options/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can manage dropdown options" });
      }
      const { value } = req.body;
      if (!value || typeof value !== "string") {
        return res.status(400).json({ message: "value is required" });
      }
      const existingOption = (await storage.getAllDropdownOptions()).find(option => option.id === Number(req.params.id));
      if (existingOption && ["posting_document_type", "guideline_module_type"].includes(existingOption.category)
        && (!value.trim() || value.trim().length > 200)) {
        return res.status(400).json({ message: "Type names must be between 1 and 200 characters" });
      }
      const opt = await storage.updateDropdownOption(parseInt(req.params.id), { value: value.trim() });
      res.json(opt);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/dropdown-options/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can manage dropdown options" });
      }
      await storage.deleteDropdownOption(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Direct Messages
  app.get("/api/messages/conversations", requireAuth, async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.session.userId!);
      res.json(conversations);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/messages/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadMessageCount(req.session.userId!);
      res.json({ count });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      const messages = await storage.getDirectMessages(req.session.userId!, parseInt(req.params.userId));
      res.json(messages);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages", requireAuth, upload.array("attachments"), async (req, res) => {
    try {
      const body = req.body || {};
      const { recipientId, content } = body;
      const files = req.files as Express.Multer.File[];
      const uploaded = files && files.length > 0 ? await saveUploadedFiles(files) : [];
      if (!recipientId || (!content?.trim() && uploaded.length === 0)) {
        return res.status(400).json({ message: "Recipient and content or attachment are required" });
      }
      const message = await storage.createDirectMessage({
        senderId: req.session.userId!,
        recipientId: parseInt(recipientId),
        content: content?.trim() || "",
        attachments: uploaded.length > 0 ? uploaded : undefined,
      });
      res.json(message);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages/:userId/read", requireAuth, async (req, res) => {
    try {
      await storage.markMessagesRead(req.session.userId!, parseInt(req.params.userId));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/files/:id", requireAuth, async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const [file] = await db.select().from(fileUploads).where(eq(fileUploads.id, fileId));
      if (!file) return res.status(404).json({ message: "File not found" });
      const buffer = Buffer.from(file.data, "base64");
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tickets", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can access tickets" });
      }
      res.json(await storage.getAllTickets());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tickets", requireAuth, upload.array("files", 10), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can create tickets" });
      }
      if (!req.body.title || !req.body.title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      const files = (req.files as Express.Multer.File[]) || [];
      const attachments = await saveUploadedFiles(files);
      const ticket = await storage.createTicket({
        title: req.body.title.trim(),
        description: req.body.description || "",
        category: req.body.category || "other",
        priority: req.body.priority || "medium",
        status: "open",
        createdById: req.session.userId!,
        attachments: attachments.length > 0 ? attachments : null,
      });
      await storage.createTicketActivity({
        ticketId: ticket.id,
        userId: req.session.userId!,
        action: "Created ticket",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(ticket);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const ticketToCheck = await storage.getTicket(parseInt(req.params.id));
      if (!ticketToCheck) return res.status(404).json({ message: "Ticket not found" });
      const isAdmin = ["admin", "manager", "account_manager", "case_manager"].includes(user.role);
      const isCreator = ticketToCheck.createdById === user.id;
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only admins or the ticket creator can update this ticket" });
      }
      const allowedFields = isAdmin
        ? ["status", "title", "description", "category", "priority"]
        : ["title", "description", "category", "priority"];
      const validStatuses = ["open", "working_on_it", "done", "closed"];
      const validCategories = ["bug", "feature_request", "ui_change", "question", "other"];
      const validPriorities = ["low", "medium", "high", "urgent"];
      const data: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      if (data.status && !validStatuses.includes(data.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      if (data.category && !validCategories.includes(data.category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      if (data.priority && !validPriorities.includes(data.priority)) {
        return res.status(400).json({ message: "Invalid priority" });
      }
      const existing = ticketToCheck;
      const fieldLabels: Record<string, string> = { status: "Status", title: "Title", description: "Description", category: "Category", priority: "Priority" };
      for (const key of Object.keys(data)) {
        const oldVal = String((existing as any)[key] ?? "");
        const newVal = String(data[key] ?? "");
        if (oldVal !== newVal) {
          await storage.createTicketActivity({
            ticketId: existing.id,
            userId: req.session.userId!,
            action: `Updated ${fieldLabels[key] || key}`,
            field: key,
            oldValue: oldVal || null,
            newValue: newVal || null,
          });
        }
      }
      const ticket = await storage.updateTicket(parseInt(req.params.id), data);
      res.json(ticket);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tickets/:id/files", requireAuth, upload.array("files", 10), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can upload files" });
      }
      const ticketId = parseInt(req.params.id);
      const existing = await storage.getTicket(ticketId);
      if (!existing) return res.status(404).json({ message: "Ticket not found" });
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) return res.status(400).json({ message: "No files provided" });
      const newAttachments = await saveUploadedFiles(files);
      const allAttachments = [...(existing.attachments || []), ...newAttachments];
      const ticket = await storage.updateTicket(ticketId, { attachments: allAttachments });
      await storage.createTicketActivity({
        ticketId,
        userId: req.session.userId!,
        action: `Uploaded ${files.length} file(s)`,
        field: null,
        oldValue: null,
        newValue: files.map(f => f.originalname).join(", "),
      });
      res.json(ticket);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tickets/:id/files/:fileIndex", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete attachments" });
      }
      const ticketId = parseInt(req.params.id);
      const fileIndex = parseInt(req.params.fileIndex);
      const existing = await storage.getTicket(ticketId);
      if (!existing) return res.status(404).json({ message: "Ticket not found" });
      const attachments = existing.attachments || [];
      if (fileIndex < 0 || fileIndex >= attachments.length) {
        return res.status(400).json({ message: "Invalid file index" });
      }
      const removed = attachments[fileIndex];
      const { name } = (() => { const parts = removed.split("|"); return { name: parts[1] || parts[0] }; })();
      const updated = attachments.filter((_, i) => i !== fileIndex);
      const ticket = await storage.updateTicket(ticketId, { attachments: updated.length > 0 ? updated : null });
      await storage.createTicketActivity({
        ticketId,
        userId: req.session.userId!,
        action: "Removed attachment",
        field: null,
        oldValue: name,
        newValue: null,
      });
      res.json(ticket);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete tickets" });
      }
      await storage.deleteTicket(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tickets/:id/comments", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can access ticket comments" });
      }
      res.json(await storage.getTicketComments(parseInt(req.params.id)));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tickets/:id/comments", requireAuth, upload.array("files", 5), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can comment on tickets" });
      }
      if (!req.body.content || !req.body.content.trim()) {
        return res.status(400).json({ message: "Comment content is required" });
      }
      const files = (req.files as Express.Multer.File[]) || [];
      const attachments = await saveUploadedFiles(files);
      const comment = await storage.createTicketComment({
        ticketId: parseInt(req.params.id),
        userId: req.session.userId!,
        content: req.body.content.trim(),
        attachments: attachments.length > 0 ? attachments : null,
      });
      await storage.createTicketActivity({
        ticketId: parseInt(req.params.id),
        userId: req.session.userId!,
        action: "Added comment",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(comment);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tickets/:id/activity", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can access ticket activity" });
      }
      res.json(await storage.getTicketActivity(parseInt(req.params.id)));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const CHECKS_ROLES = ["admin", "payment_specialist", "account_manager"];

  app.get("/api/checks", requireAuth, async (req, res, next) => {
    try {
      const user=await storage.getUser(req.session.userId!);
      const access=await resolveRcmAccess(req.session.userId!);
      // Workload mode is never an authorization bypass.
      if(!user||!access||!CHECKS_ROLES.includes(user.role)||
         !permissionAllowed(access.context,"checks.read")){
        return res.status(403).json({message:"Checks access denied"});
      }
      const clinicIds=await legacyClinicNameIds();
      const all=await storage.getAllChecks();
      const visible=all.filter(c=>scopedLegacyRecord(access.context,clinicIds,c.clinic,"Checks","checks.read"));
      res.setHeader("Cache-Control","private, no-store");
      res.json(visible);
    }catch(error){next(error);}
  });

  app.post("/api/checks", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !CHECKS_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const data: any = { ...req.body };
      const dateFields = ["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f]) { data[f] = new Date(data[f]); } else { data[f] = null; }
      }
      autoAssignStatus(data);
      const check = await storage.createCheck(data);
      await storage.createCheckActivity({
        checkId: check.id,
        userId: req.session.userId!,
        action: "Check created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (data.status === "Done") {
        await storage.createCheckActivity({ checkId: check.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }
      res.json(check);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/checks/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !CHECKS_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids must be a non-empty array" });
      }
      const ALLOWED = new Set(["assignedTo", "clinic", "checkNumber", "amount", "checkDate", "inputDate", "insurance", "fileName", "scannedDate", "type", "status", "postedDate", "depositDate", "depositedBy", "activity"]);
      const data: any = {};
      for (const k of Object.keys(rawData || {})) {
        if (ALLOWED.has(k)) data[k] = rawData[k];
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "No editable fields provided" });
      }
      const dateFields = ["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) data[f] = data[f] ? new Date(data[f]) : null;
      }
      const checkDateFields = new Set(dateFields);
      const normCheckDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };

      let updatedCount = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getCheck(id);
        if (!existing) continue;

        const checkCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = checkDateFields.has(field) ? normCheckDate(oldRaw) : String(oldRaw || "");
          const newVal = checkDateFields.has(field) ? normCheckDate(newRaw) : String(newRaw || "");
          if (newRaw !== undefined && oldVal !== newVal) {
            const activityUserId = (field === "status" && String(newVal) === "Done") ? (checkCreditId || req.session.userId!) : req.session.userId!;
            await storage.createCheckActivity({
              checkId: id,
              userId: activityUserId,
              action: `Changed ${field} (bulk)`,
              field,
              oldValue: oldVal ? String(oldVal) : null,
              newValue: newVal ? String(newVal) : null,
            });
          }
        }
        const perRecord = { ...data };
        autoAssignStatus(perRecord, existing);
        await storage.updateCheck(id, perRecord);
        updatedCount += 1;
      }
      res.json({ ok: true, updated: updatedCount });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/checks/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !CHECKS_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const id = parseInt(req.params.id);
      const existing = await storage.getCheck(id);
      if (!existing) return res.status(404).json({ message: "Check not found" });
      const data: any = { ...req.body };
      const dateFields = ["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) { data[f] = data[f] ? new Date(data[f]) : null; }
      }
      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const checkActivityHistory = await storage.getCheckActivity(id);
        await handleOutcomeTransfer(data.outcome, "Checks", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          activityHistory: checkActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const checkCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      const checkDateFields = new Set(["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"]);
      const normCheckDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      const trackFields = ["assignedTo", "clinic", "checkNumber", "amount", "checkDate", "inputDate", "insurance", "fileName", "scannedDate", "type", "status", "postedDate", "depositDate", "depositedBy", "outcome", "activity"];
      for (const field of trackFields) {
        const oldRaw = (existing as any)[field];
        const newRaw = data[field];
        const oldVal = checkDateFields.has(field) ? normCheckDate(oldRaw) : String(oldRaw || "");
        const newVal = checkDateFields.has(field) ? normCheckDate(newRaw) : String(newRaw || "");
        if (newRaw !== undefined && oldVal !== newVal) {
          const activityUserId = (field === "status" && String(newVal) === "Done") ? (checkCreditId || req.session.userId!) : req.session.userId!;
          await storage.createCheckActivity({
            checkId: id,
            userId: activityUserId,
            action: `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
      autoAssignStatus(data, existing);
      const updated = await storage.updateCheck(id, data);
      if (updated && updated.outcome === "Send to RTP") await syncRTPRecord("Checks", id, updated);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/checks/:id", requireAuth, async (req, res, next) => {
    try {
      const id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:"Invalid Check ID"});
      const user=await storage.getUser(req.session.userId!);
      const access=await resolveRcmAccess(req.session.userId!);
      if(!user||!access||!CHECKS_ROLES.includes(user.role)||
         !permissionAllowed(access.context,"checks.read"))
        return res.status(403).json({message:"Checks access denied"});
      const record=await storage.getCheck(id);
      if(!record)return res.status(404).json({message:"Check not found"});
      const clinicIds=await legacyClinicNameIds();
      if(!scopedLegacyRecord(access.context,clinicIds,record.clinic,"Checks","checks.read"))
        return res.status(404).json({message:"Check not found"});
      res.setHeader("Cache-Control","private, no-store");
      res.json(record);
    }catch(error){next(error);}
  });

  app.get("/api/checks/:id/activity", requireAuth, async (req, res, next) => {
    try {
      const id=Number(req.params.id);
      if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:"Invalid Check ID"});
      const user=await storage.getUser(req.session.userId!);
      const access=await resolveRcmAccess(req.session.userId!);
      if(!user||!access||!CHECKS_ROLES.includes(user.role)||
         !permissionAllowed(access.context,"checks.read"))
        return res.status(403).json({message:"Checks access denied"});
      const record=await storage.getCheck(id);
      if(!record)return res.status(404).json({message:"Check not found"});
      const clinicIds=await legacyClinicNameIds();
      if(!scopedLegacyRecord(access.context,clinicIds,record.clinic,"Checks","checks.read"))
        return res.status(404).json({message:"Check not found"});
      res.setHeader("Cache-Control","private, no-store");
      res.json(await storage.getCheckActivity(id));
    }catch(error){next(error);}
  });

  app.post("/api/checks/:id/notes", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { note } = req.body;
      if (!note) return res.status(400).json({ message: "Note required" });
      const existing = await storage.getCheck(id);
      if (!existing) return res.status(404).json({ message: "Check not found" });
      const user = await storage.getUser(req.session.userId!);
      if (!user || !CHECKS_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const existingNotes = existing.notes || "";
      const timestamp = new Date().toISOString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`
        : `[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`;
      await storage.updateCheck(id, { notes: newNotes });
      await storage.createCheckActivity({
        checkId: id,
        userId: req.session.userId!,
        action: "Added note",
        field: "notes",
        oldValue: null,
        newValue: note,
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/checks/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete checks" });
      }
      await storage.deleteCheck(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/checks/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deleteCheck(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/closed", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getAllClosed());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/closed", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const body = { ...req.body };
      if (body.regularVisit !== undefined && body.regularVisit !== "") body.regularVisit = parseInt(body.regularVisit) || null;
      else if (body.regularVisit === "") body.regularVisit = null;
      if (body.fullVisit !== undefined && body.fullVisit !== "") body.fullVisit = parseInt(body.fullVisit) || null;
      else if (body.fullVisit === "") body.fullVisit = null;
      if (body.numberOfVisits !== undefined && body.numberOfVisits !== "") body.numberOfVisits = parseInt(body.numberOfVisits) || null;
      else if (body.numberOfVisits === "") body.numberOfVisits = null;
      autoAssignStatus(body);
      const record = await storage.createClosed(body);
      await storage.createClosedActivity({
        closedId: record.id,
        userId: req.session.userId!,
        action: "Record created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      if (body.status === "Done") {
        await storage.createClosedActivity({ closedId: record.id, userId: req.session.userId!, action: "Status set to Done", field: "status", oldValue: null, newValue: "Done" });
      }
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/closed/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !ADMIN_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set(["patientName", "clinic", "insurance", "assignedTo", "status", "outcome", "priority", "action", "reason", "amount", "dosFrom", "dosTo", "numberOfVisits", "regularVisit", "fullVisit", "reportedDate"]);
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["dosFrom", "dosTo", "reportedDate"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      for (const f of ["numberOfVisits", "regularVisit", "fullVisit"]) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const n = parseInt(String(data[f]), 10); if (isNaN(n)) return res.status(400).json({ message: `Invalid value for ${f}` }); data[f] = n; }
        }
      }
      const fieldLabels: Record<string, string> = {
        patientName: "Patient Name", clinic: "Clinic", insurance: "Insurance", assignedTo: "Assigned To",
        status: "Status", outcome: "Outcome", priority: "Priority", action: "Action", reason: "Reason",
        amount: "Amount", dosFrom: "DOS From", dosTo: "DOS To", numberOfVisits: "# of Visits",
        regularVisit: "Regular Visit", fullVisit: "Full Visit", reportedDate: "Reported Date",
      };
      const norm = (v: any) => { if (v === null || v === undefined || v === "") return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getClosed(id);
        if (!existing) continue;
        await storage.updateClosed(id, data);
        for (const field of Object.keys(data)) {
          const oldRaw = (existing as any)[field];
          const newRaw = data[field];
          const oldVal = dateFields.has(field) ? norm(oldRaw) : String(oldRaw ?? "");
          const newVal = dateFields.has(field) ? norm(newRaw) : String(newRaw ?? "");
          if (newRaw !== undefined && oldVal !== newVal) {
            await storage.createClosedActivity({ closedId: id, userId: req.session.userId!, action: `Updated ${fieldLabels[field] || field} (bulk)`, field, oldValue: oldVal || null, newValue: newVal || null });
          }
        }
        updated++;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/closed/bulk-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        await storage.deleteClosed(id);
        deleted++;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/cleanup-legacy-rtp", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const legacy = await db.select({ id: closed.id }).from(closed).where(eq(closed.source, "RTP"));
      let deleted = 0;
      for (const row of legacy) {
        await storage.deleteClosed(row.id);
        deleted++;
      }
      res.json({ ok: true, deleted, message: `Deleted ${deleted} legacy RTP record(s)` });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/closed/export", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }
      const now = new Date();
      const records: any[] = [];
      for (const id of ids) {
        const updated = await storage.updateClosed(Number(id), { dateExported: now });
        if (updated) records.push(updated);
      }
      res.json({ ok: true, exportedAt: now.toISOString(), records });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/closed/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getClosed(id);
      if (!existing) return res.status(404).json({ message: "Record not found" });
      const data: any = { ...req.body };

      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const closedActivityHistory = await storage.getClosedActivity(id);
        await handleOutcomeTransfer(data.outcome, "RTP", {
          ...existing,
          amount: data.amount !== undefined ? data.amount : existing.amount,
          activityHistory: closedActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      if (data.regularVisit !== undefined && data.regularVisit !== "") {
        data.regularVisit = parseInt(data.regularVisit) || null;
      } else if (data.regularVisit === "") {
        data.regularVisit = null;
      }
      if (data.fullVisit !== undefined && data.fullVisit !== "") {
        data.fullVisit = parseInt(data.fullVisit) || null;
      } else if (data.fullVisit === "") {
        data.fullVisit = null;
      }
      if (data.numberOfVisits !== undefined && data.numberOfVisits !== "") {
        data.numberOfVisits = parseInt(data.numberOfVisits) || null;
      } else if (data.numberOfVisits === "") {
        data.numberOfVisits = null;
      }

      const closedCreditId = await getAssigneeUserId(data.assignedTo !== undefined ? data.assignedTo : existing.assignedTo);
      const closedDateFields = new Set(["dosFrom", "dosTo", "reportedDate"]);
      const normClosedDate = (v: any) => { if (!v) return ""; try { return new Date(v).toISOString().slice(0, 10); } catch { return String(v); } };
      const trackFields = ["patientName", "clinic", "insurance", "dosFrom", "dosTo", "numberOfVisits", "amount", "assignedTo", "action", "status", "outcome", "priority", "notes", "reason", "regularVisit", "fullVisit", "reportedDate"];
      for (const field of trackFields) {
        const oldRaw = (existing as any)[field];
        const newRaw = data[field];
        const oldVal = closedDateFields.has(field) ? normClosedDate(oldRaw) : String(oldRaw || "");
        const newVal = closedDateFields.has(field) ? normClosedDate(newRaw) : String(newRaw || "");
        if (newRaw !== undefined && oldVal !== newVal) {
          const activityUserId = (field === "status" && String(newVal) === "Done") ? (closedCreditId || req.session.userId!) : req.session.userId!;
          await storage.createClosedActivity({
            closedId: id,
            userId: activityUserId,
            action: `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
      autoAssignStatus(data, existing);
      const updated = await storage.updateClosed(id, data);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/closed/:id/activity", requireAuth, async (req, res) => {
    res.json(await storage.getClosedActivity(parseInt(req.params.id)));
  });

  app.delete("/api/closed/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "case_manager", "account_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins can delete closed records" });
      }
      await storage.deleteClosed(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/closed/:id/notes", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getClosed(id);
      if (!existing) return res.status(404).json({ message: "Record not found" });
      const { note } = req.body;
      if (!note) return res.status(400).json({ message: "Note is required" });
      const user = await storage.getUser(req.session.userId!);
      const existingNotes = existing.notes || "";
      const timestamp = new Date().toISOString();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`
        : `[${user?.fullName || "Unknown"} - ${timestamp}]\n${note}`;
      await storage.updateClosed(id, { notes: newNotes });
      await storage.createClosedActivity({
        closedId: id,
        userId: req.session.userId!,
        action: "Added note",
        field: "notes",
        oldValue: null,
        newValue: note,
      });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/my-assignments", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const fullName = user.fullName;

      const allTasks = await storage.getAllTasks();
      const myTasks = allTasks.filter((t: any) => t.assignedUserId === user.id && t.status !== "done" && t.bucket !== "done");

      const allChecks = await db.select().from(checks);
      const myChecks = allChecks.filter((c: any) => c.assignedTo === fullName && (c.status || "").toLowerCase() !== "done");

      const allPostings = await db.select().from(postings);
      const myPostings = allPostings.filter((p: any) => p.assignedTo === fullName && (p.status || "").toLowerCase() !== "done");

      const allCollections = await db.select().from(collections);
      const myCollections = allCollections.filter((c: any) => c.assignedTo === fullName && (c.status || "").toLowerCase() !== "done");

      const allDenials = await db.select().from(denials);
      const myDenials = allDenials.filter((d: any) => d.assignedTo === fullName && (d.status || "").toLowerCase() !== "done");

      const allArbitrations = await db.select().from(arbitrations);
      const myArbitrations = allArbitrations.filter((a: any) => a.assignedTo === fullName && (a.status || "").toLowerCase() !== "done");

      res.json({
        tasks: myTasks,
        checks: myChecks,
        postings: myPostings,
        collections: myCollections,
        denials: myDenials,
        arbitrations: myArbitrations,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  function requireCeoAccess(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    storage.getUser(req.session.userId).then(user => {
      if (!user || !user.ceoBoxAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      next();
    }).catch(() => res.status(500).json({ message: "Server error" }));
  }

  app.patch("/api/users/:id/ceo-access", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage CEO Box access" });
      }
      const id = parseInt(req.params.id);
      const { ceoBoxAccess } = req.body;
      const updated = await storage.updateUser(id, { ceoBoxAccess: Boolean(ceoBoxAccess) });
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safe } = updated;
      res.json(safe);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ceo-box", requireCeoAccess, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const records = await storage.getCeoBoxRecords(user.id, user.fullName);
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ceo-box", requireCeoAccess, upload.array("attachments"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const files = req.files as Express.Multer.File[];
      const uploaded = files && files.length > 0 ? await saveUploadedFiles(files) : [];
      const dateFields = ["dateOfLetter", "dueDate"];
      const data: any = { ...req.body };
      dateFields.forEach(f => {
        if (data[f]) data[f] = new Date(data[f]);
        else data[f] = null;
      });
      if (data.attachments) {
        try { data.attachments = JSON.parse(data.attachments); } catch { data.attachments = []; }
      }
      data.attachments = [...(data.attachments || []), ...uploaded];
      const record = await storage.createCeoBoxRecord(data, user.id);
      res.json(record);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ceo-box/bulk-update", requireCeoAccess, async (req, res) => {
    try {
      const { ids, data: rawData } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      const ALLOWED = new Set(["work", "sender", "company", "clinic", "action", "status", "priority", "dateOfLetter", "dueDate"]);
      const data: any = {};
      for (const k of Object.keys(rawData || {})) if (ALLOWED.has(k)) data[k] = rawData[k];
      if (Object.keys(data).length === 0) return res.status(400).json({ message: "No editable fields provided" });
      const dateFields = new Set(["dateOfLetter", "dueDate"]);
      for (const f of Array.from(dateFields)) {
        if (data[f] !== undefined) {
          if (data[f] === null || data[f] === "") { data[f] = null; }
          else { const d = new Date(data[f]); if (isNaN(d.getTime())) return res.status(400).json({ message: `Invalid date for ${f}` }); data[f] = d; }
        }
      }
      let updated = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getCeoBoxRecord(id);
        if (!existing) continue;
        await storage.updateCeoBoxRecord(id, data);
        updated += 1;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ceo-box/bulk-delete", requireCeoAccess, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ids must be a non-empty array" });
      let deleted = 0;
      for (const rawId of ids) {
        const id = parseInt(String(rawId));
        if (isNaN(id)) continue;
        const existing = await storage.getCeoBoxRecord(id);
        if (!existing) continue;
        if (existing.createdById !== user.id) continue;
        await storage.deleteCeoBoxRecord(id);
        deleted += 1;
      }
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/ceo-box/:id", requireCeoAccess, upload.array("newAttachments"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const id = parseInt(req.params.id);
      const existing = await storage.getCeoBoxRecord(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const files = req.files as Express.Multer.File[];
      const uploaded = files && files.length > 0 ? await saveUploadedFiles(files) : [];
      const dateFields = ["dateOfLetter", "dueDate"];
      const data: any = { ...req.body };
      dateFields.forEach(f => {
        if (data[f]) data[f] = new Date(data[f]);
        else if (data[f] === "" || data[f] === null) data[f] = null;
        else delete data[f];
      });
      if (data.confidential !== undefined) {
        data.confidential = data.confidential === "true" || data.confidential === true;
      }
      if (data.attachments !== undefined) {
        try { data.attachments = JSON.parse(data.attachments); } catch { data.attachments = existing.attachments || []; }
      }
      if (uploaded.length > 0) {
        data.attachments = [...(data.attachments || existing.attachments || []), ...uploaded];
      }
      const updated = await storage.updateCeoBoxRecord(id, data);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ceo-box/:id/notes", requireCeoAccess, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const id = parseInt(req.params.id);
      const existing = await storage.getCeoBoxRecord(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const { note } = req.body;
      if (!note || !note.trim()) return res.status(400).json({ message: "Note is required" });
      const timestamp = new Date().toISOString();
      const entry = `[${user.fullName} - ${timestamp}]\n${note.trim()}`;
      const updated = await storage.updateCeoBoxRecord(id, {
        notes: existing.notes ? `${existing.notes}\n${entry}` : entry,
      });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/ceo-box/:id", requireCeoAccess, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const id = parseInt(req.params.id);
      const existing = await storage.getCeoBoxRecord(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (existing.createdById !== user.id) {
        return res.status(403).json({ message: "You can only delete your own records" });
      }
      await storage.deleteCeoBoxRecord(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/ceo-box/:id/attachments/:index", requireCeoAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idx = parseInt(req.params.index);
      const existing = await storage.getCeoBoxRecord(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const atts = [...(existing.attachments || [])];
      atts.splice(idx, 1);
      const updated = await storage.updateCeoBoxRecord(id, { attachments: atts });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/recover-notes", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }

      const now = new Date().toISOString();
      let recovered = 0;
      const details: string[] = [];

      // Build a unified source pool from every tracker.
      // Each entry: { patientKey, notesText, trackerName, id, outcome }
      const [allTasks, allCollections, allPostings, allDenials, allArbitrations, allChecks, allClosed] = await Promise.all([
        storage.getAllTasks(),
        storage.getAllCollections(),
        storage.getAllPostings(),
        storage.getAllDenials(),
        storage.getAllArbitrations(),
        storage.getAllChecks(),
        storage.getAllClosed(),
      ]);

      type SourceEntry = { patientKey: string; notesText: string; trackerName: string; id: number; outcome: string };
      const sources: SourceEntry[] = [];

      for (const t of allTasks) {
        if (!t.outcome) continue;
        const notesText = (t.notes || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (t.patientName || "").toLowerCase().trim(), notesText, trackerName: "Tasks", id: t.id, outcome: t.outcome });
      }
      for (const c of allCollections) {
        if (!c.outcome) continue;
        const notesText = (c.notes || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (c.patientName || "").toLowerCase().trim(), notesText, trackerName: "Collections", id: c.id, outcome: c.outcome });
      }
      for (const p of allPostings) {
        if (!p.outcome) continue;
        const notesText = (p.notes || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (p.patientName || "").toLowerCase().trim(), notesText, trackerName: "Posting", id: p.id, outcome: p.outcome });
      }
      for (const d of allDenials) {
        if (!d.outcome) continue;
        const notesText = (d.comments || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (d.patientName || "").toLowerCase().trim(), notesText, trackerName: "Denials", id: d.id, outcome: d.outcome });
      }
      for (const a of allArbitrations) {
        if (!a.outcome) continue;
        const notesText = (a.comments || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (a.patientName || "").toLowerCase().trim(), notesText, trackerName: "Arbitration", id: a.id, outcome: a.outcome });
      }
      for (const ch of allChecks) {
        if (!ch.outcome) continue;
        const notesText = (ch.notes || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (ch.patientName || "").toLowerCase().trim(), notesText, trackerName: "Checks", id: ch.id, outcome: ch.outcome });
      }
      for (const cl of allClosed) {
        if (!cl.outcome) continue;
        const notesText = (cl.notes || "").trim();
        if (!notesText) continue;
        sources.push({ patientKey: (cl.patientName || "").toLowerCase().trim(), notesText, trackerName: "Closed", id: cl.id, outcome: cl.outcome });
      }

      // Helper: find matching source record
      const findSource = (destPatientKey: string, destOutcome: string): SourceEntry | undefined =>
        sources.find(s => s.patientKey === destPatientKey && s.patientKey !== "" && s.outcome === destOutcome && s.notesText !== "");

      // --- Recover Postings (notes field) ---
      for (const posting of allPostings) {
        if (posting.notes && posting.notes.trim() !== "") continue;
        const patientKey = (posting.patientName || "").toLowerCase().trim();
        const src = findSource(patientKey, "Send to Posting");
        if (src) {
          const recovered_notes = `[Recovered from ${src.trackerName} - ${now}]\n${src.notesText}`;
          await storage.updatePosting(posting.id, { notes: recovered_notes });
          await storage.createPostingActivity({ postingId: posting.id, userId: req.session.userId!, action: `Notes recovered from ${src.trackerName}`, field: "notes", oldValue: null, newValue: recovered_notes });
          recovered++;
          details.push(`Posting #${posting.id} (${posting.patientName}): recovered from ${src.trackerName} #${src.id}`);
        }
      }

      // --- Recover Collections (notes field) ---
      for (const collection of allCollections) {
        if (collection.notes && collection.notes.trim() !== "") continue;
        const patientKey = (collection.patientName || "").toLowerCase().trim();
        const src = findSource(patientKey, "Send to Collections");
        if (src) {
          const recovered_notes = `[Recovered from ${src.trackerName} - ${now}]\n${src.notesText}`;
          await storage.updateCollection(collection.id, { notes: recovered_notes });
          await storage.createCollectionActivity({ collectionId: collection.id, userId: req.session.userId!, action: `Notes recovered from ${src.trackerName}`, field: "notes", oldValue: null, newValue: recovered_notes });
          recovered++;
          details.push(`Collection #${collection.id} (${collection.patientName}): recovered from ${src.trackerName} #${src.id}`);
        }
      }

      // --- Recover Denials (comments field) ---
      for (const denial of allDenials) {
        if (denial.comments && denial.comments.trim() !== "") continue;
        const patientKey = (denial.patientName || "").toLowerCase().trim();
        const src = findSource(patientKey, "Send to Denials");
        if (src) {
          const recovered_notes = `[Recovered from ${src.trackerName} - ${now}]\n${src.notesText}`;
          await storage.updateDenial(denial.id, { comments: recovered_notes });
          await storage.createDenialActivity({ denialId: denial.id, userId: req.session.userId!, action: `Notes recovered from ${src.trackerName}`, field: "comments", oldValue: null, newValue: recovered_notes });
          recovered++;
          details.push(`Denial #${denial.id} (${denial.patientName}): recovered from ${src.trackerName} #${src.id}`);
        }
      }

      // --- Recover Arbitrations (comments field) ---
      for (const arb of allArbitrations) {
        if (arb.comments && arb.comments.trim() !== "") continue;
        const patientKey = (arb.patientName || "").toLowerCase().trim();
        const src = findSource(patientKey, "Send to Arbitration");
        if (src) {
          const recovered_notes = `[Recovered from ${src.trackerName} - ${now}]\n${src.notesText}`;
          await storage.updateArbitration(arb.id, { comments: recovered_notes });
          await storage.createArbitrationActivity({ arbitrationId: arb.id, userId: req.session.userId!, action: `Notes recovered from ${src.trackerName}`, field: "comments", oldValue: null, newValue: recovered_notes });
          recovered++;
          details.push(`Arbitration #${arb.id} (${arb.patientName}): recovered from ${src.trackerName} #${src.id}`);
        }
      }

      // --- Recover Closed (notes field) ---
      for (const cl of allClosed) {
        if (cl.notes && cl.notes.trim() !== "") continue;
        const patientKey = (cl.patientName || "").toLowerCase().trim();
        const src = findSource(patientKey, "Send to Closed") || findSource(patientKey, "Send to RTP");
        if (src) {
          const recovered_notes = `[Recovered from ${src.trackerName} - ${now}]\n${src.notesText}`;
          await storage.updateClosed(cl.id, { notes: recovered_notes });
          await storage.createClosedActivity({ closedId: cl.id, userId: req.session.userId!, action: `Notes recovered from ${src.trackerName}`, field: "notes", oldValue: null, newValue: recovered_notes });
          recovered++;
          details.push(`Closed #${cl.id} (${cl.patientName}): recovered from ${src.trackerName} #${src.id}`);
        }
      }

      res.json({ recovered, details });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/backfill-assigned-status", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }

      const { sql } = await import("drizzle-orm");
      const result: Record<string, number> = {};

      const tables = [
        { name: "denials", statusCol: "denial_status" },
        { name: "arbitrations", statusCol: "arbitration_status" },
        { name: "collections", statusCol: "collection_status" },
        { name: "postings", statusCol: "posting_status" },
        { name: "checks", statusCol: "check_status" },
        { name: "closed", statusCol: "closed_status" },
      ];

      for (const t of tables) {
        const r: any = await db.execute(sql.raw(`
          UPDATE ${t.name}
          SET ${t.statusCol} = 'Assigned'
          WHERE assigned_to IS NOT NULL
            AND TRIM(assigned_to) <> ''
            AND (${t.statusCol} IS NULL OR TRIM(${t.statusCol}) = '' OR LOWER(TRIM(${t.statusCol})) = 'unassigned')
        `));
        result[t.name] = r.rowCount ?? 0;
      }

      const taskRes: any = await db.execute(sql.raw(`
        UPDATE tasks SET status = 'assigned'
        WHERE assigned_user_id IS NOT NULL AND status = 'unassigned'
      `));
      result["tasks"] = taskRes.rowCount ?? 0;

      const total = Object.values(result).reduce((a, b) => a + b, 0);
      res.json({ ok: true, total, byTable: result });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/rename-kimberly", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }

      const { sql } = await import("drizzle-orm");
      const OLD = "Kimberly";
      const NEW = "Kimberly Noche";
      const result: Record<string, number> = {};

      const targets: { table: string; column: string }[] = [
        { table: "denials", column: "assigned_to" },
        { table: "denials", column: "intake" },
        { table: "denials", column: "checked_by" },
        { table: "arbitrations", column: "assigned_to" },
        { table: "arbitrations", column: "intake" },
        { table: "arbitrations", column: "checked_by" },
        { table: "collections", column: "assigned_to" },
        { table: "postings", column: "assigned_to" },
        { table: "checks", column: "assigned_to" },
        { table: "checks", column: "deposited_by" },
        { table: "closed", column: "assigned_to" },
      ];

      for (const t of targets) {
        const r: any = await db.execute(sql.raw(`
          UPDATE ${t.table}
          SET ${t.column} = '${NEW}'
          WHERE LOWER(TRIM(${t.column})) = LOWER('${OLD}')
        `));
        const key = `${t.table}.${t.column}`;
        result[key] = r.rowCount ?? 0;
      }

      const total = Object.values(result).reduce((a, b) => a + b, 0);
      res.json({ ok: true, total, byColumn: result, from: OLD, to: NEW });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Call Calendar ─────────────────────────────────────────────────────────

  app.get("/api/calls", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const isManager = ADMIN_ROLES.includes(user.role);
      const { dateFrom, dateTo, assignedUserId, callStatus, department, myCallsOnly } = req.query;
      const filters: any = {};
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) { const d = new Date(dateTo as string); d.setUTCHours(23, 59, 59, 999); filters.dateTo = d; }
      if (callStatus && callStatus !== "all") filters.callStatus = callStatus as string;
      if (department && department !== "all") filters.department = department as string;
      if (!isManager || myCallsOnly === "true") {
        if (assignedUserId && assignedUserId !== "all") filters.assignedUserId = Number(assignedUserId);
        else if (!isManager) filters.assignedUserId = user.id;
      } else if (assignedUserId && assignedUserId !== "all") {
        filters.assignedUserId = Number(assignedUserId);
      }
      const calls = await storage.getScheduledCalls(filters);
      res.json(calls);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/calls", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const { patientName, relatedTaskId, department, assignedUserId, scheduledAt, callReason, priority, phoneNumber, notes, clinic, insurance } = req.body;
      if (!patientName?.trim()) return res.status(400).json({ message: "Patient name is required" });
      if (!scheduledAt) return res.status(400).json({ message: "Scheduled date/time is required" });
      if (!callReason?.trim()) return res.status(400).json({ message: "Call reason is required" });
      const call = await storage.createScheduledCall({
        patientName: patientName.trim(), relatedTaskId: relatedTaskId ? Number(relatedTaskId) : null,
        department: department || null, assignedUserId: assignedUserId ? Number(assignedUserId) : null,
        createdByUserId: user.id, scheduledAt: new Date(scheduledAt), timezone: "America/New_York",
        callReason: callReason.trim(), priority: priority || "medium", callStatus: "Scheduled",
        phoneNumber: phoneNumber?.trim() || null, notes: notes?.trim() || null, clinic: clinic || null, insurance: insurance || null,
      });
      await storage.createCallActivity({ scheduledCallId: call.id, actorUserId: user.id, eventType: "Call Scheduled", newValues: JSON.stringify({ patientName, scheduledAt, callReason }) });
      if (assignedUserId && Number(assignedUserId) !== user.id) {
        await storage.createNotification({ userId: Number(assignedUserId), message: `A call has been assigned to you: ${patientName} – ${callReason}`, read: false } as any);
      }
      res.json(call);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/stats", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000 - 1);
      const allCalls = await storage.getScheduledCalls({ dateFrom: todayStart, dateTo: todayEnd });
      res.json({
        scheduledToday: allCalls.length,
        resolvedToday: allCalls.filter((c: any) => ["Resolved", "Completed"].includes(c.callStatus)).length,
        overdueToday: allCalls.filter((c: any) => !["Resolved", "Completed", "Cancelled"].includes(c.callStatus) && new Date(c.scheduledAt) < now).length,
        followUpRequired: allCalls.filter((c: any) => c.callStatus === "Follow-Up Required").length,
        unassigned: allCalls.filter((c: any) => !c.assignedUserId).length,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/agent-stats", requireAuth, async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const filters: any = {};
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) { const d = new Date(dateTo as string); d.setUTCHours(23, 59, 59, 999); filters.dateTo = d; }
      const calls = await storage.getScheduledCalls(filters);
      const agentMap: Record<number, any> = {};
      for (const call of calls) {
        if (!call.assignedUserId) continue;
        if (!agentMap[call.assignedUserId]) {
          agentMap[call.assignedUserId] = { userId: call.assignedUserId, userName: (call as any).assignedUserName || "Unknown", assigned: 0, done: 0, pending: 0, rescheduled: 0 };
        }
        const s = agentMap[call.assignedUserId];
        s.assigned++;
        if (["Completed", "Resolved"].includes(call.callStatus)) s.done++;
        else if (call.callStatus === "Rescheduled") s.rescheduled++;
        else s.pending++;
      }
      const result = Object.values(agentMap).map((s: any) => ({ ...s, successRate: s.assigned > 0 ? Math.round((s.done / s.assigned) * 100) : 0 })).sort((a: any, b: any) => b.assigned - a.assigned);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/daily-schedule", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const isManager = ADMIN_ROLES.includes(user.role);
      let targetUserId = user.id;
      let targetUserFullName = user.fullName;
      if (isManager && req.query.userId) {
        const tu = await storage.getUser(Number(req.query.userId));
        if (tu) { targetUserId = tu.id; targetUserFullName = tu.fullName; }
      }
      const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const patients = await storage.getPatientDailySchedule(targetUserId, targetUserFullName, dateStr);
      res.json(patients);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/calls/daily-schedule/:scheduleId/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const scheduleId = parseInt(req.params.scheduleId);
      const { dailyStatus } = req.body;
      const VALID_STATUSES = ["Done", "Resolved", "Voicemail", "Wrong #", "Call Back", "Unable", null];
      if (!VALID_STATUSES.includes(dailyStatus)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      // Verify ownership — agents can only update their own rows; managers can update any
      const row = await storage.getPatientScheduleEntry(scheduleId);
      if (!row) return res.status(404).json({ message: "Schedule entry not found" });
      if (!ADMIN_ROLES.includes(user.role) && row.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.updatePatientScheduleDailyStatus(scheduleId, dailyStatus);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/calls/daily-schedule/:scheduleId/notes", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const scheduleId = parseInt(req.params.scheduleId);
      const { notes } = req.body;
      const row = await storage.getPatientScheduleEntry(scheduleId);
      if (!row) return res.status(404).json({ message: "Schedule entry not found" });
      if (!ADMIN_ROLES.includes(user.role) && row.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.updatePatientScheduleNotes(scheduleId, notes ?? null);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Find-or-create the scheduled_call linked to a daily schedule entry.
  // Returns the full scheduled_call object so the client can open CallDetailPanel.
  app.post("/api/calls/daily-schedule/:scheduleId/ensure-call", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const scheduleId = parseInt(req.params.scheduleId);
      const row = await storage.getPatientScheduleEntry(scheduleId);
      if (!row) return res.status(404).json({ message: "Schedule entry not found" });
      if (!ADMIN_ROLES.includes(user.role) && row.userId !== user.id) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const call = await storage.ensurePatientScheduleCall(scheduleId, user.id);
      // Return with assignedUserName so CallDetailPanel can display it
      const assignedUser = call.assignedUserId ? await storage.getUser(call.assignedUserId) : null;
      res.json({ ...call, assignedUserName: assignedUser?.fullName ?? null });
    } catch (e: any) {
      console.error("[ensure-call] error for scheduleId", req.params.scheduleId, e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/calls/rollover-audit", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const isManager = ADMIN_ROLES.includes(user.role);
      // Managers see all; agents see only their own
      const targetUserId = (isManager && req.query.userId)
        ? Number(req.query.userId)
        : (isManager ? undefined : user.id);
      const audit = await storage.getPatientCallAudit(targetUserId, 500);
      res.json(audit);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/:id", requireAuth, async (req, res) => {
    try {
      const call = await storage.getScheduledCall(Number(req.params.id));
      if (!call) return res.status(404).json({ message: "Call not found" });
      res.json(call);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/calls/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const existing = await storage.getScheduledCall(id);
      if (!existing) return res.status(404).json({ message: "Call not found" });
      if (!ADMIN_ROLES.includes(user.role) && existing.assignedUserId !== user.id) return res.status(403).json({ message: "Not authorized" });
      const allowed = ["patientName", "relatedTaskId", "department", "assignedUserId", "scheduledAt", "callReason", "priority", "callStatus", "phoneNumber", "notes", "clinic", "insurance", "completedAt", "cancelledAt", "cancellationReason"];
      const updates: any = {};
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
      if (updates.scheduledAt) updates.scheduledAt = new Date(updates.scheduledAt);
      const call = await storage.updateScheduledCall(id, updates);
      await storage.createCallActivity({ scheduledCallId: id, actorUserId: user.id, eventType: "Call Updated", oldValues: JSON.stringify({ callStatus: existing.callStatus, scheduledAt: existing.scheduledAt }), newValues: JSON.stringify(updates) });
      res.json(call);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/calls/:id/start", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const existing = await storage.getScheduledCall(id);
      if (!existing) return res.status(404).json({ message: "Call not found" });
      const call = await storage.updateScheduledCall(id, { callStatus: "In Progress" });
      await storage.createCallActivity({ scheduledCallId: id, actorUserId: user.id, eventType: "Call Started", oldValues: JSON.stringify({ callStatus: existing.callStatus }), newValues: JSON.stringify({ callStatus: "In Progress" }) });
      res.json(call);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/calls/:id/cancel", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const existing = await storage.getScheduledCall(id);
      if (!existing) return res.status(404).json({ message: "Call not found" });
      if (!ADMIN_ROLES.includes(user.role) && existing.assignedUserId !== user.id) return res.status(403).json({ message: "Not authorized" });
      const call = await storage.updateScheduledCall(id, { callStatus: "Cancelled", cancelledAt: new Date(), cancellationReason: req.body.reason || null });
      await storage.createCallActivity({ scheduledCallId: id, actorUserId: user.id, eventType: "Call Cancelled", newValues: JSON.stringify({ reason: req.body.reason }) });
      res.json(call);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/:id/attempts", requireAuth, async (req, res) => {
    try {
      const attempts = await storage.getCallAttempts(Number(req.params.id));
      res.json(attempts);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/calls/:id/attempts", requireAuth, async (req, res) => {
    try {
      const callId = Number(req.params.id);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const existing = await storage.getScheduledCall(callId);
      if (!existing) return res.status(404).json({ message: "Call not found" });
      const { outcome, contactPerson, notes, startedAt, endedAt, followUpRequired, nextScheduledAt, nextAssignedUserId, updateTaskStatus, newTaskStatus, otherExplanation } = req.body;
      if (!outcome) return res.status(400).json({ message: "Outcome is required" });
      if (outcome === "Other" && !otherExplanation?.trim()) return res.status(400).json({ message: "Explanation required when outcome is Other" });
      let durationSeconds: number | null = null;
      if (startedAt && endedAt) durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
      const attempt = await storage.createCallAttempt({
        scheduledCallId: callId, attemptedByUserId: user.id,
        startedAt: startedAt ? new Date(startedAt) : null, endedAt: endedAt ? new Date(endedAt) : null,
        durationSeconds, outcome: outcome + (outcome === "Other" && otherExplanation ? `: ${otherExplanation}` : ""),
        contactPerson: contactPerson?.trim() || null, notes: notes?.trim() || null, followUpRequired: !!followUpRequired,
      });
      const RESOLVED_OUTCOMES = ["Spoke With Patient", "Spoke With Authorized Contact", "Resolved", "Documentation Received"];
      const FOLLOWUP_OUTS = ["Left Voicemail", "No Answer", "Busy", "Patient Requested Callback", "Insurance Follow-Up Required", "Clinic Follow-Up Required", "Documentation Requested", "Language Assistance Needed"];
      let newCallStatus = "Attempted";
      if (RESOLVED_OUTCOMES.includes(outcome)) newCallStatus = "Resolved";
      else if (followUpRequired || FOLLOWUP_OUTS.includes(outcome)) newCallStatus = "Follow-Up Required";
      let nextCall: any = null;
      if (nextScheduledAt && followUpRequired) {
        nextCall = await storage.createScheduledCall({ patientName: existing.patientName, relatedTaskId: existing.relatedTaskId, department: existing.department, assignedUserId: nextAssignedUserId ? Number(nextAssignedUserId) : existing.assignedUserId, createdByUserId: user.id, scheduledAt: new Date(nextScheduledAt), timezone: "America/New_York", callReason: existing.callReason, priority: existing.priority, callStatus: "Scheduled", phoneNumber: existing.phoneNumber, clinic: existing.clinic, insurance: existing.insurance, parentCallId: callId });
        newCallStatus = "Rescheduled";
        await storage.createCallActivity({ scheduledCallId: callId, callAttemptId: attempt.id, actorUserId: user.id, eventType: "Follow-Up Scheduled", newValues: JSON.stringify({ nextScheduledAt, nextCallId: nextCall.id }) });
      }
      await storage.updateScheduledCall(callId, { callStatus: newCallStatus, ...(newCallStatus === "Resolved" ? { completedAt: new Date() } : {}) });
      await storage.createCallActivity({ scheduledCallId: callId, callAttemptId: attempt.id, actorUserId: user.id, eventType: "Attempt Recorded", newValues: JSON.stringify({ outcome, callStatus: newCallStatus }) });

      // If this call is linked to a patient_call_schedule entry, sync the dailyStatus
      const scheduleEntry = await storage.getPatientScheduleEntryByCallId(callId);
      if (scheduleEntry) {
        const OUTCOME_TO_DAILY: Record<string, string> = {
          "Spoke With Patient":           "Done",
          "Spoke With Authorized Contact": "Done",
          "Resolved":                     "Resolved",
          "Documentation Received":       "Done",
          "Left Voicemail":               "Voicemail",
          "Wrong Number":                 "Wrong #",
          "Disconnected Number":          "Wrong #",
          "Patient Requested Callback":   "Call Back",
          "No Answer":                    "Unable",
          "Busy":                         "Unable",
          "Unable to Verify Identity":    "Unable",
          "Language Assistance Needed":   "Unable",
        };
        // Check base outcome (before any "Other: …" suffix)
        const baseOutcome = outcome.split(":")[0].trim();
        const dailyStatus = OUTCOME_TO_DAILY[baseOutcome] ?? "Unable";
        await storage.updatePatientScheduleDailyStatus(scheduleEntry.id, dailyStatus);
      }
      if (updateTaskStatus && newTaskStatus && existing.relatedTaskId) {
        const VALID_STATUSES = ["unassigned", "assigned", "working_on_it", "done"];
        if (VALID_STATUSES.includes(newTaskStatus)) {
          await storage.updateTask(existing.relatedTaskId, { status: newTaskStatus });
          await storage.createCallActivity({ scheduledCallId: callId, actorUserId: user.id, eventType: "Related Task Status Updated", newValues: JSON.stringify({ taskId: existing.relatedTaskId, newStatus: newTaskStatus }) });
        }
      }
      res.json({ attempt, nextCall });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/calls/:id/activity", requireAuth, async (req, res) => {
    try {
      const activity = await storage.getCallActivityLog(Number(req.params.id));
      res.json(activity);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/teams", requireAuth, async (req, res) => {
    try {
      const result = await storage.getTeamsWithMembers();
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/teams", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Name required" });
      const team = await storage.createTeam({ name: name.trim() });
      res.json(team);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Name required" });
      const team = await storage.updateTeam(Number(req.params.id), { name: name.trim() });
      if (!team) return res.status(404).json({ message: "Not found" });
      res.json(team);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      await storage.deleteTeam(Number(req.params.id));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/teams/:id/members", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId required" });
      const membership = await storage.addUserToTeam(Number(req.params.id), Number(userId));
      res.json(membership);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/teams/:id/members/:userId", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || requestingUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
      await storage.removeUserFromTeam(Number(req.params.id), Number(req.params.userId));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  return httpServer;
}
