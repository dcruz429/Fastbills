import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import path from "path";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { db } from "./db";
import { fileUploads, tasks, arbitrations, arbitrationActivity, denials, denialActivity, collections, collectionActivity, postings, postingActivity, checks, checkActivity, closed, closedActivity, taskActivity, users, DROPDOWN_CATEGORIES, OUTCOME_OPTIONS, ceoBox, CEO_USERS, DR_AL_NAME } from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

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

async function handleOutcomeTransfer(
  outcome: string,
  source: string,
  record: { patientName?: string; clinic?: string; insurance?: string; amount?: string | null; notes?: string | null; comments?: string | null; activityHistory?: { field: string; oldValue: string | null; newValue: string | null; action: string; timestamp: Date }[]; [key: string]: any },
  userId: number
) {
  const patientName = record.patientName || "Unknown";
  const clinic = record.clinic || null;
  const insurance = record.insurance || null;
  const amount = record.amount || null;
  const existingNotes = record.notes || record.comments || null;

  const transferHeader = `[Transferred from ${source} - ${new Date().toISOString()}]`;
  const combinedNotes = existingNotes
    ? `${transferHeader}\nTransferred from ${source}\n\n${existingNotes}`
    : `${transferHeader}\nTransferred from ${source}`;

  const allClinics = await storage.getAllClinics();
  const allInsurances = await storage.getAllInsurances();
  const clinicId = clinic ? (allClinics.find(c => c.name === clinic)?.id ?? null) : null;
  const insuranceId = insurance ? (allInsurances.find(i => i.name === insurance)?.id ?? null) : null;

  let newRecordId: number | null = null;
  let targetType: string | null = null;

  switch (outcome) {
    case "Send to Verification": {
      const task = await storage.createTask({
        patientName,
        clinicId,
        insuranceId,
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
        priority: "low",
        status: "unassigned",
        bucket: "ready_for_billing",
        notes: combinedNotes,
        rtp: false,
      });
      newRecordId = task.id;
      targetType = "task";
      break;
    }
    case "Send to Posting": {
      const posting = await storage.createPosting({
        patientName,
        clinic,
        insurance,
        status: "Unassigned",
        amount,
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
        status: "Unassigned",
        amount,
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
        status: "Unassigned",
        amount,
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
        status: "Unassigned",
        amount,
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
        status: "Unassigned",
        amount,
        source,
        sourceId: record.id ?? null,
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
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "workflow-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

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
      res.json(safeUser);
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
    res.json(safeUser);
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

  app.post("/api/users", requireAuth, async (req, res) => {
    try {
      const requestingUser = await storage.getUser(req.session.userId!);
      if (!requestingUser || !["admin", "manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const { username, password, fullName, role } = req.body;
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
      if (!requestingUser || !["admin", "manager"].includes(requestingUser.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const id = parseInt(req.params.id);
      const updateData = { ...req.body };
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
      if (!requestingUser || !["admin", "manager"].includes(requestingUser.role)) {
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

      const [verifActs, billActs, denialActs, arbActs, collActs, postActs, checkActs, closedActs] = await Promise.all([
        db.select({
          id: taskActivity.id, userId: taskActivity.userId, action: taskActivity.action,
          timestamp: taskActivity.timestamp, userName: users.fullName, patientName: tasks.patientName,
        }).from(taskActivity)
          .leftJoin(users, eq(taskActivity.userId, users.id))
          .leftJoin(tasks, eq(taskActivity.taskId, tasks.id))
          .where(and(eq(taskActivity.field, "status"), eq(taskActivity.newValue, "verified")))
          .orderBy(desc(taskActivity.timestamp)),

        db.select({
          id: taskActivity.id, userId: taskActivity.userId, action: taskActivity.action,
          timestamp: taskActivity.timestamp, userName: users.fullName, patientName: tasks.patientName,
          bucket: tasks.bucket,
        }).from(taskActivity)
          .leftJoin(users, eq(taskActivity.userId, users.id))
          .leftJoin(tasks, eq(taskActivity.taskId, tasks.id))
          .where(and(eq(taskActivity.field, "status"), inArray(taskActivity.newValue, ["billed", "done"])))
          .orderBy(desc(taskActivity.timestamp)),

        db.select({
          id: denialActivity.id, userId: denialActivity.userId, action: denialActivity.action,
          timestamp: denialActivity.timestamp, userName: users.fullName, patientName: denials.patientName,
        }).from(denialActivity)
          .leftJoin(users, eq(denialActivity.userId, users.id))
          .leftJoin(denials, eq(denialActivity.denialId, denials.id))
          .where(and(eq(denialActivity.field, "status"), eq(denialActivity.newValue, "Done")))
          .orderBy(desc(denialActivity.timestamp)),

        db.select({
          id: arbitrationActivity.id, userId: arbitrationActivity.userId, action: arbitrationActivity.action,
          timestamp: arbitrationActivity.timestamp, userName: users.fullName, patientName: arbitrations.patientName,
        }).from(arbitrationActivity)
          .leftJoin(users, eq(arbitrationActivity.userId, users.id))
          .leftJoin(arbitrations, eq(arbitrationActivity.arbitrationId, arbitrations.id))
          .where(and(eq(arbitrationActivity.field, "status"), eq(arbitrationActivity.newValue, "Done")))
          .orderBy(desc(arbitrationActivity.timestamp)),

        db.select({
          id: collectionActivity.id, userId: collectionActivity.userId, action: collectionActivity.action,
          timestamp: collectionActivity.timestamp, userName: users.fullName, patientName: collections.patientName,
        }).from(collectionActivity)
          .leftJoin(users, eq(collectionActivity.userId, users.id))
          .leftJoin(collections, eq(collectionActivity.collectionId, collections.id))
          .where(and(eq(collectionActivity.field, "status"), eq(collectionActivity.newValue, "Done")))
          .orderBy(desc(collectionActivity.timestamp)),

        db.select({
          id: postingActivity.id, userId: postingActivity.userId, action: postingActivity.action,
          timestamp: postingActivity.timestamp, userName: users.fullName, patientName: postings.patientName,
        }).from(postingActivity)
          .leftJoin(users, eq(postingActivity.userId, users.id))
          .leftJoin(postings, eq(postingActivity.postingId, postings.id))
          .where(and(eq(postingActivity.field, "status"), eq(postingActivity.newValue, "Done")))
          .orderBy(desc(postingActivity.timestamp)),

        db.select({
          id: checkActivity.id, userId: checkActivity.userId, action: checkActivity.action,
          timestamp: checkActivity.timestamp, userName: users.fullName, patientName: checks.patientName,
        }).from(checkActivity)
          .leftJoin(users, eq(checkActivity.userId, users.id))
          .leftJoin(checks, eq(checkActivity.checkId, checks.id))
          .where(and(eq(checkActivity.field, "status"), eq(checkActivity.newValue, "Done")))
          .orderBy(desc(checkActivity.timestamp)),

        db.select({
          id: closedActivity.id, userId: closedActivity.userId, action: closedActivity.action,
          timestamp: closedActivity.timestamp, userName: users.fullName,
          patientName: closed.patientName, closedSource: closed.source,
        }).from(closedActivity)
          .leftJoin(users, eq(closedActivity.userId, users.id))
          .leftJoin(closed, eq(closedActivity.closedId, closed.id))
          .where(and(eq(closedActivity.field, "status"), eq(closedActivity.newValue, "Done")))
          .orderBy(desc(closedActivity.timestamp)),
      ]);

      const all = [
        ...verifActs.map(a => ({ ...a, department: "Verification" })),
        ...billActs.map(a => ({ ...a, department: a.bucket === "for_verification" ? "Verification" : "Billing", bucket: undefined })),
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

      res.json(all);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tasks", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (user && (user.role === "verifier" || user.role === "biller")) {
      const allTasks = await storage.getAllTasks();
      res.json(allTasks.filter((t) => t.assignedUserId === user.id));
    } else {
      res.json(await storage.getAllTasks());
    }
  });

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

      if (updates.outcome && OUTCOME_OPTIONS.includes(updates.outcome) && updates.outcome !== existing.outcome) {
        const clinicName = existing.clinicId ? (await storage.getAllClinics()).find(c => c.id === existing.clinicId)?.name : null;
        const insuranceName = existing.insuranceId ? (await storage.getAllInsurances()).find(i => i.id === existing.insuranceId)?.name : null;
        const taskActivityHistory = await storage.getTaskActivity(id);
        await handleOutcomeTransfer(updates.outcome, "Verification/Billing", {
          ...existing,
          clinic: clinicName || null,
          insurance: insuranceName || null,
          amount: null,
          notes: existing.notes,
          activityHistory: taskActivityHistory.map(a => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const fieldsToTrack = ["patientName", "chartNumber", "clinicId", "insuranceId", "assignedUserId", "priority", "status", "bucket", "dueDate", "ieDate", "rtp", "resolutionDate", "outcome", "activity"];
      for (const field of fieldsToTrack) {
        if (updates[field] !== undefined && String(updates[field]) !== String((existing as any)[field])) {
          await storage.createTaskActivity({
            taskId: id,
            userId: req.session.userId!,
            action: `Updated ${field}`,
            field,
            oldValue: String((existing as any)[field] ?? ""),
            newValue: String(updates[field] ?? ""),
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete tasks" });
      }
      const id = parseInt(req.params.id);
      const existing = await storage.getTask(id);
      if (!existing) return res.status(404).json({ message: "Task not found" });
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

  app.get("/api/tasks/:taskId/activity", requireAuth, async (req, res) => {
    const taskId = parseInt(req.params.taskId);
    res.json(await storage.getTaskActivity(taskId));
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

  app.get("/api/denials", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllDenials();
      if (ADMIN_ROLES.includes(user.role)) {
        res.json(all);
      } else {
        res.json(all.filter(d => d.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const denialFieldLabels: Record<string, string> = {
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment", assignedTo: "Assigned To",
    action: "Activity",
  };

  const denialTrackFields = Object.keys(denialFieldLabels);

  app.post("/api/denials", requireAuth, async (req, res) => {
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
      const denial = await storage.createDenial(data);

      await storage.createDenialActivity({
        denialId: denial.id,
        userId: req.session.userId!,
        action: "Denial created",
        field: null,
        oldValue: null,
        newValue: null,
      });

      res.json(denial);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/denials/:id", requireAuth, async (req, res) => {
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
          activityHistory: denialActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      for (const field of [...denialTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = String((existing as any)[field] ?? "");
          const newVal = String(data[field] ?? "");
          if (oldVal !== newVal) {
            await storage.createDenialActivity({
              denialId: id,
              userId: req.session.userId!,
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

  app.get("/api/denials/:id/activity", requireAuth, async (req, res) => {
    const denialId = parseInt(req.params.id);
    res.json(await storage.getDenialActivity(denialId));
  });

  app.post("/api/denials/:id/send-to-arbitration", requireAuth, async (req, res) => {
    try {
      const denial = await storage.getDenial(parseInt(req.params.id));
      if (!denial) return res.status(404).json({ message: "Denial not found" });
      const arbData = {
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete denials" });
      }
      await storage.deleteDenial(parseInt(req.params.id));
      res.json({ ok: true });
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
      if (ADMIN_ROLES.includes(user.role)) {
        res.json(all);
      } else {
        res.json(all.filter(a => a.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const arbFieldLabels: Record<string, string> = {
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment", assignedTo: "Assigned To",
    activity: "Activity",
  };
  const arbTrackFields = Object.keys(arbFieldLabels);

  app.post("/api/arbitrations", requireAuth, async (req, res) => {
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
      const arb = await storage.createArbitration(data);
      await storage.createArbitrationActivity({
        arbitrationId: arb.id,
        userId: req.session.userId!,
        action: "Arbitration created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(arb);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/arbitrations/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getArbitration(id);
      if (!existing) return res.status(404).json({ message: "Arbitration not found" });
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
        const arbActivityHistory = await storage.getArbitrationActivity(id);
        await handleOutcomeTransfer(data.outcome, "Arbitration", {
          ...existing,
          activityHistory: arbActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      for (const field of [...arbTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = String((existing as any)[field] ?? "");
          const newVal = String(data[field] ?? "");
          if (oldVal !== newVal) {
            await storage.createArbitrationActivity({
              arbitrationId: id,
              userId: req.session.userId!,
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

  app.get("/api/arbitrations/:id/activity", requireAuth, async (req, res) => {
    const arbId = parseInt(req.params.id);
    res.json(await storage.getArbitrationActivity(arbId));
  });

  app.delete("/api/arbitrations/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete arbitrations" });
      }
      await storage.deleteArbitration(parseInt(req.params.id));
      res.json({ ok: true });
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
      if (ADMIN_ROLES.includes(user.role)) {
        res.json(all);
      } else {
        res.json(all.filter(c => c.assignedTo === user.fullName));
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const collectionFieldLabels: Record<string, string> = {
    patientName: "Patient's Name", inputDate: "Input Date", clinic: "Clinic", division: "Division",
    insurance: "Insurance", dosFrom: "DOS From", dosTo: "DOS To", numberOfVisits: "# of Visits",
    amount: "Amount", issueType: "Issue Type", typeOfDenial: "Type of Denial", action: "Activity",
    outcome: "Outcome", priority: "Priority", assignedTo: "Assigned to", status: "Status",
  };
  const collectionTrackFields = Object.keys(collectionFieldLabels);

  app.post("/api/collections", requireAuth, async (req, res) => {
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
      const collection = await storage.createCollection(data);
      await storage.createCollectionActivity({
        collectionId: collection.id,
        userId: req.session.userId!,
        action: "Collection created",
        field: null,
        oldValue: null,
        newValue: null,
      });
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
          if (match) {
            await storage.updateCollection(match.id, data);
            await storage.createCollectionActivity({
              collectionId: match.id,
              userId: req.session.userId!,
              action: "Collection updated (CSV import)",
              field: null,
              oldValue: null,
              newValue: null,
            });
            results.updated++;
          } else {
            const collection = await storage.createCollection(data);
            await storage.createCollectionActivity({
              collectionId: collection.id,
              userId: req.session.userId!,
              action: "Collection created (CSV import)",
              field: null,
              oldValue: null,
              newValue: null,
            });
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
          if (match) { await storage.updateDenial(match.id, data); await storage.createDenialActivity({ denialId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null }); results.updated++; }
          else { const rec = await storage.createDenial(data); await storage.createDenialActivity({ denialId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null }); results.success++; }
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
      const dateFields = ["inputDate", "dosFrom", "dosTo", "dateOfLetter", "trialDate", "effectiveDate"];
      const results = { success: 0, updated: 0, errors: [] as string[] };
      const existing = await storage.getAllArbitrations();
      for (let i = 0; i < rows.length; i++) {
        try {
          const data: any = { ...rows[i] };
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          for (const f of dateFields) { data[f] = data[f] ? new Date(data[f]) : null; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => r.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() && (r.clinic || "").toLowerCase() === (data.clinic || "").toLowerCase());
          if (match) { await storage.updateArbitration(match.id, data); await storage.createArbitrationActivity({ arbitrationId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null }); results.updated++; }
          else { const rec = await storage.createArbitration(data); await storage.createArbitrationActivity({ arbitrationId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null }); results.success++; }
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
          if (!data.patientName?.trim()) { results.errors.push(`Row ${i + 1}: Patient Name required`); continue; }
          for (const f of dateFields) { data[f] = data[f] ? new Date(data[f]) : null; }
          if (data.amount) data.amount = data.amount.replace(/[$,\s()]/g, "");
          const match = existing.find(r => r.patientName?.toLowerCase().trim() === data.patientName.toLowerCase().trim() && (r.fileNumber || "").toLowerCase() === (data.fileNumber || "").toLowerCase());
          if (match) { await storage.updatePosting(match.id, data); await storage.createPostingActivity({ postingId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null }); results.updated++; }
          else { const rec = await storage.createPosting(data); await storage.createPostingActivity({ postingId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null }); results.success++; }
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
          if (match) { await storage.updateCheck(match.id, data); await storage.createCheckActivity({ checkId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null }); results.updated++; }
          else { const rec = await storage.createCheck(data); await storage.createCheckActivity({ checkId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null }); results.success++; }
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
          if (match) { await storage.updateClosed(match.id, data); await storage.createClosedActivity({ closedId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null }); results.updated++; }
          else { const rec = await storage.createClosed(data); await storage.createClosedActivity({ closedId: rec.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null }); results.success++; }
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

          if (match) {
            await storage.updateTask(match.id, data);
            await storage.createTaskActivity({ taskId: match.id, userId: req.session.userId!, action: "Updated (CSV import)", field: null, oldValue: null, newValue: null });
            results.updated++;
          } else {
            const task = await storage.createTask({ ...data, uploaderId: req.session.userId! });
            await storage.createTaskActivity({ taskId: task.id, userId: req.session.userId!, action: "Created (CSV import)", field: null, oldValue: null, newValue: null });
            results.success++;
          }
        } catch (e: any) { results.errors.push(`Row ${i + 1}: ${e.message}`); }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/collections/:id", requireAuth, async (req, res) => {
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
          activityHistory: collActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      for (const field of [...collectionTrackFields, "outcome"]) {
        if (data[field] !== undefined) {
          const oldVal = String((existing as any)[field] ?? "");
          const newVal = String(data[field] ?? "");
          if (oldVal !== newVal) {
            await storage.createCollectionActivity({
              collectionId: id,
              userId: req.session.userId!,
              action: `Updated ${collectionFieldLabels[field] || field}`,
              field,
              oldValue: oldVal || null,
              newValue: newVal || null,
            });
          }
        }
      }
      const collection = await storage.updateCollection(id, data);
      if (collection && collection.outcome === "Send to RTP") await syncRTPRecord("Collections", id, collection);
      res.json(collection);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete collections" });
      }
      await storage.deleteCollection(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Postings
  const PAYMENT_DOC_ROLES = ["admin", "payment_specialist", "account_manager"];

  app.get("/api/postings", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const all = await storage.getAllPostings();
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

  app.post("/api/postings", requireAuth, async (req, res) => {
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
      const posting = await storage.createPosting(data);
      await storage.createPostingActivity({
        postingId: posting.id,
        userId: req.session.userId!,
        action: "Posting created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(posting);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/postings/:id", requireAuth, async (req, res) => {
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
          activityHistory: postingActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const trackFields = ["fileNumber", "clinic", "documentType", "priority", "assignedTo", "status", "scannedDate", "postedDate", "amount", "outcome", "activity"];
      for (const field of trackFields) {
        const oldVal = (existing as any)[field];
        const newVal = data[field];
        if (newVal !== undefined && String(oldVal || "") !== String(newVal || "")) {
          await storage.createPostingActivity({
            postingId: id,
            userId: req.session.userId!,
            action: `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
      const updated = await storage.updatePosting(id, data);
      if (updated && updated.outcome === "Send to RTP") await syncRTPRecord("Posting", id, updated);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete postings" });
      }
      await storage.deletePosting(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Announcements / Message Board
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

  app.post("/api/announcements", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can create announcements" });
      }
      const { title, body, targetType, targetRoles, targetUserIds } = req.body;
      if (!title || !body || !targetType) {
        return res.status(400).json({ message: "Title, body, and target type are required" });
      }
      const announcement = await storage.createAnnouncement({
        title,
        body,
        authorId: user.id,
        targetType,
        targetRoles: targetRoles || null,
        targetUserIds: targetUserIds || null,
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can update tickets" });
      }
      const allowedFields = ["status", "title", "description", "category", "priority"];
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
      const existing = await storage.getTicket(parseInt(req.params.id));
      if (!existing) return res.status(404).json({ message: "Ticket not found" });
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

  app.get("/api/checks", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      if (!CHECKS_ROLES.includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }
      const all = await storage.getAllChecks();
      res.json(all);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
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
      const check = await storage.createCheck(data);
      await storage.createCheckActivity({
        checkId: check.id,
        userId: req.session.userId!,
        action: "Check created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(check);
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
      if (user.role === "payment_specialist" && existing.assignedTo !== user.fullName) {
        return res.status(403).json({ message: "You can only edit checks assigned to you" });
      }
      const data: any = { ...req.body };
      const dateFields = ["checkDate", "inputDate", "scannedDate", "postedDate", "depositDate"];
      for (const f of dateFields) {
        if (data[f] !== undefined) { data[f] = data[f] ? new Date(data[f]) : null; }
      }
      if (data.outcome && OUTCOME_OPTIONS.includes(data.outcome) && data.outcome !== existing.outcome) {
        const checkActivityHistory = await storage.getCheckActivity(id);
        await handleOutcomeTransfer(data.outcome, "Checks", {
          ...existing,
          activityHistory: checkActivityHistory.map((a: any) => ({ field: a.field || "", oldValue: a.oldValue, newValue: a.newValue, action: a.action, timestamp: a.timestamp })),
        }, req.session.userId!);
      }

      const trackFields = ["assignedTo", "clinic", "checkNumber", "amount", "checkDate", "inputDate", "insurance", "fileName", "scannedDate", "type", "status", "postedDate", "depositDate", "depositedBy", "outcome", "activity"];
      for (const field of trackFields) {
        const oldVal = (existing as any)[field];
        const newVal = data[field];
        if (newVal !== undefined && String(oldVal || "") !== String(newVal || "")) {
          await storage.createCheckActivity({
            checkId: id,
            userId: req.session.userId!,
            action: `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
      const updated = await storage.updateCheck(id, data);
      if (updated && updated.outcome === "Send to RTP") await syncRTPRecord("Checks", id, updated);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/checks/:id/activity", requireAuth, async (req, res) => {
    const activity = await storage.getCheckActivity(parseInt(req.params.id));
    res.json(activity);
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
      if (user.role === "payment_specialist" && existing.assignedTo !== user.fullName) {
        return res.status(403).json({ message: "You can only add notes to checks assigned to you" });
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
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Only admins can delete checks" });
      }
      await storage.deleteCheck(parseInt(req.params.id));
      res.json({ ok: true });
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
      const record = await storage.createClosed(body);
      await storage.createClosedActivity({
        closedId: record.id,
        userId: req.session.userId!,
        action: "Record created",
        field: null,
        oldValue: null,
        newValue: null,
      });
      res.json(record);
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

      const trackFields = ["patientName", "clinic", "insurance", "assignedTo", "status", "amount", "notes", "outcome", "activity", "reason", "dosFrom", "dosTo", "regularVisit", "fullVisit", "reportedDate"];
      for (const field of trackFields) {
        const oldVal = (existing as any)[field];
        const newVal = data[field];
        if (newVal !== undefined && String(oldVal || "") !== String(newVal || "")) {
          await storage.createClosedActivity({
            closedId: id,
            userId: req.session.userId!,
            action: `Changed ${field}`,
            field,
            oldValue: oldVal ? String(oldVal) : null,
            newValue: newVal ? String(newVal) : null,
          });
        }
      }
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
      if (!user || user.role !== "admin") {
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

  return httpServer;
}
