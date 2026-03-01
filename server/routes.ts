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
import { fileUploads, arbitrations, arbitrationActivity, denials, denialActivity, DROPDOWN_CATEGORIES } from "@shared/schema";
import { eq } from "drizzle-orm";

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
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createClinic({ name }));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/clinics/:id", requireAuth, async (req, res) => {
    try {
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
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createInsurance({ name }));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/insurances/:id", requireAuth, async (req, res) => {
    try {
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
      await storage.deleteInsurance(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/productivity", requireAuth, async (req, res) => {
    try {
      const activities = await storage.getAllTaskActivity();
      const completionActions = activities.filter(a =>
        a.field === "status" && (a.newValue === "verified" || a.newValue === "billed" || a.newValue === "dropped")
      );
      res.json(completionActions);
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
    status: z.enum(["working_on_it", "billed", "done", "dropped", "assigned", "unassigned"]).optional(),
    bucket: z.enum(["for_verification", "ready_for_billing", "done"]).default("for_verification"),
    dueDate: z.string().nullable().optional(),
    ieDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getUser(req.session.userId!);
      if (!creator || (creator.role !== "admin" && creator.role !== "manager" && creator.role !== "assigner")) {
        return res.status(403).json({ message: "Only admins and assigners can create tasks" });
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
      if (updates.assignedUserId !== undefined && editor && editor.role !== "admin" && editor.role !== "manager" && editor.role !== "assigner") {
        delete updates.assignedUserId;
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

      if (updates.status !== undefined && updates.status !== "dropped" && existing.status === "dropped") {
        updates.rtp = false;
      }

      const wasVerified = updates.status === "verified" && existing.bucket === "for_verification";
      if (wasVerified) {
        await storage.createTaskActivity({
          taskId: id,
          userId: req.session.userId!,
          action: "Updated status",
          field: "status",
          oldValue: String(existing.status),
          newValue: "verified",
        });
        updates.bucket = "ready_for_billing";
        updates.status = "unassigned";
        updates.assignedUserId = null;
      }

      if (updates.status === "billed" && existing.bucket === "ready_for_billing") {
        updates.bucket = "done";
      }

      if (updates.status === "dropped") {
        updates.bucket = "done";
      }

      if (updates.assignedUserId !== undefined && updates.status === undefined) {
        if (updates.assignedUserId && !existing.assignedUserId) {
          updates.status = "assigned";
        } else if (!updates.assignedUserId && existing.assignedUserId) {
          updates.status = "unassigned";
        }
      }

      if (updates.bucket === "done" && existing.bucket !== "done" && updates.status !== "billed") {
        if (!updates.status || (updates.status !== "billed" && updates.status !== "dropped")) {
          updates.status = "billed";
        }
      }

      const fieldsToTrack = ["patientName", "chartNumber", "clinicId", "insuranceId", "assignedUserId", "priority", "status", "bucket", "dueDate", "ieDate", "rtp", "resolutionDate"];
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
        const adminsAndAssigners = allUsers.filter(u => u.role === "admin" || u.role === "manager" || u.role === "assigner");
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
      if (!user || (user.role !== "admin" && user.role !== "manager")) {
        return res.status(403).json({ message: "Only admins and managers can delete tasks" });
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

  app.get("/api/denials", requireAuth, async (_req, res) => {
    res.json(await storage.getAllDenials());
  });

  const denialFieldLabels: Record<string, string> = {
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment",
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

      for (const field of denialTrackFields) {
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
      if (!user || (user.role !== "admin" && user.role !== "manager")) {
        return res.status(403).json({ message: "Only admins and managers can delete denials" });
      }
      await storage.deleteDenial(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Arbitration routes
  app.get("/api/arbitrations", requireAuth, async (_req, res) => {
    res.json(await storage.getAllArbitrations());
  });

  const arbFieldLabels: Record<string, string> = {
    denialFileName: "File Name", dateInput: "Date Input", intake: "Intake", doa: "DOA",
    clinic: "Clinic", patientName: "Patient Name", insurance: "Insurance",
    dateOfLetter: "Date of Letter", typeOfDenial: "Type of Denial", effectiveDate: "Effective Date",
    dosFrom: "DOS From", dosTo: "DOS To", numberOfDays: "# of Days", amount: "Amount",
    comments: "Comments", filedTo: "Filed To", arbStatus: "ARB Status", trialDate: "Trial Date",
    arbPaymentStatus: "ARB Payment Status", amountReceived: "Amount Received",
    checkedBy: "Checked By", comment: "Comment",
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
      for (const field of arbTrackFields) {
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
      if (!user || (user.role !== "admin" && user.role !== "manager")) {
        return res.status(403).json({ message: "Only admins and managers can delete arbitrations" });
      }
      await storage.deleteArbitration(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Collections routes
  app.get("/api/collections", requireAuth, async (_req, res) => {
    res.json(await storage.getAllCollections());
  });

  const collectionFieldLabels: Record<string, string> = {
    patientName: "Patient's Name", inputDate: "Input Date", clinic: "Clinic", division: "Division",
    insurance: "Insurance", dosFrom: "DOS From", dosTo: "DOS To", numberOfVisits: "# of Visits",
    amount: "Amount", issueType: "Issue Type", typeOfDenial: "Type of Denial", action: "Action",
    outcome: "Outcome", priority: "Priority", assignedTo: "Assigned to", status: "Status",
  };
  const collectionTrackFields = Object.keys(collectionFieldLabels);

  app.post("/api/collections", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can create collections" });
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

  app.patch("/api/collections/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can edit collections" });
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
      for (const field of collectionTrackFields) {
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
      res.json(collection);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/collections/:id/activity", requireAuth, async (req, res) => {
    const collectionId = parseInt(req.params.id);
    res.json(await storage.getCollectionActivity(collectionId));
  });

  app.delete("/api/collections/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !["admin", "manager"].includes(user.role)) {
        return res.status(403).json({ message: "Only admins and managers can delete collections" });
      }
      await storage.deleteCollection(parseInt(req.params.id));
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
      if (user.role === "admin" || user.role === "manager") {
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
      if (!user || !["admin", "manager"].includes(user.role)) {
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
      if (!["admin", "manager"].includes(user.role)) {
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
      if (!user || !["admin", "manager"].includes(user.role)) {
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
      if (!user || !["admin", "manager"].includes(user.role)) {
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
      if (!user || !["admin", "manager"].includes(user.role)) {
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

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const { recipientId, content } = req.body;
      if (!recipientId || !content?.trim()) {
        return res.status(400).json({ message: "Recipient and content are required" });
      }
      const message = await storage.createDirectMessage({
        senderId: req.session.userId!,
        recipientId: parseInt(recipientId),
        content: content.trim(),
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
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }
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

  return httpServer;
}
