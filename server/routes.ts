import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { z } from "zod";

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

      if ((updates.status === "done" || updates.status === "verified") && existing.bucket === "for_verification") {
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
        if (!updates.status || (updates.status !== "done" && updates.status !== "billed" && updates.status !== "dropped")) {
          updates.status = "done";
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

  return httpServer;
}
