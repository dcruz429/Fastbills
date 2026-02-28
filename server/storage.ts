import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  tasks,
  clinics,
  insurances,
  taskActivity,
  notifications,
  denials,
  denialActivity,
  tickets,
  ticketComments,
  type User,
  type InsertUser,
  type Task,
  type InsertTask,
  type Clinic,
  type InsertClinic,
  type Insurance,
  type InsertInsurance,
  type TaskActivity,
  type InsertTaskActivity,
  type Notification,
  type InsertNotification,
  type TaskWithRelations,
  type Denial,
  type InsertDenial,
  type DenialActivity,
  type InsertDenialActivity,
  type Ticket,
  type InsertTicket,
  type TicketComment,
  type InsertTicketComment,
  type TicketWithRelations,
  type TicketCommentWithUser,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getAllClinics(): Promise<Clinic[]>;
  createClinic(data: InsertClinic): Promise<Clinic>;
  updateClinic(id: number, data: Partial<InsertClinic>): Promise<Clinic | undefined>;
  deleteClinic(id: number): Promise<void>;

  getAllInsurances(): Promise<Insurance[]>;
  createInsurance(data: InsertInsurance): Promise<Insurance>;
  updateInsurance(id: number, data: Partial<InsertInsurance>): Promise<Insurance | undefined>;
  deleteInsurance(id: number): Promise<void>;

  getAllTasks(): Promise<TaskWithRelations[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask & { uploaderId?: number | null }): Promise<Task>;
  updateTask(id: number, data: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;

  getTaskActivity(taskId: number): Promise<TaskActivity[]>;
  getAllTaskActivity(): Promise<TaskActivity[]>;
  createTaskActivity(data: InsertTaskActivity): Promise<TaskActivity>;

  getNotification(id: number): Promise<Notification | undefined>;
  getNotifications(userId: number): Promise<Notification[]>;
  createNotification(data: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: number): Promise<void>;

  getAllDenials(): Promise<Denial[]>;
  getDenial(id: number): Promise<Denial | undefined>;
  createDenial(data: InsertDenial): Promise<Denial>;
  updateDenial(id: number, data: Partial<Denial>): Promise<Denial | undefined>;
  deleteDenial(id: number): Promise<void>;

  getDenialActivity(denialId: number): Promise<any[]>;
  createDenialActivity(data: InsertDenialActivity): Promise<DenialActivity>;

  getAllTickets(): Promise<TicketWithRelations[]>;
  getTicket(id: number): Promise<Ticket | undefined>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, data: Partial<Ticket>): Promise<Ticket | undefined>;
  deleteTicket(id: number): Promise<void>;
  getTicketComments(ticketId: number): Promise<TicketCommentWithUser[]>;
  createTicketComment(data: InsertTicketComment): Promise<TicketComment>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getAllClinics(): Promise<Clinic[]> {
    return db.select().from(clinics);
  }

  async createClinic(data: InsertClinic): Promise<Clinic> {
    const [clinic] = await db.insert(clinics).values(data).returning();
    return clinic;
  }

  async updateClinic(id: number, data: Partial<InsertClinic>): Promise<Clinic | undefined> {
    const [clinic] = await db.update(clinics).set(data).where(eq(clinics.id, id)).returning();
    return clinic;
  }

  async deleteClinic(id: number): Promise<void> {
    await db.delete(clinics).where(eq(clinics.id, id));
  }

  async getAllInsurances(): Promise<Insurance[]> {
    return db.select().from(insurances);
  }

  async createInsurance(data: InsertInsurance): Promise<Insurance> {
    const [ins] = await db.insert(insurances).values(data).returning();
    return ins;
  }

  async updateInsurance(id: number, data: Partial<InsertInsurance>): Promise<Insurance | undefined> {
    const [ins] = await db.update(insurances).set(data).where(eq(insurances.id, id)).returning();
    return ins;
  }

  async deleteInsurance(id: number): Promise<void> {
    await db.delete(insurances).where(eq(insurances.id, id));
  }

  async getAllTasks(): Promise<TaskWithRelations[]> {
    const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    const allUsers = await db.select().from(users);
    const allClinics = await db.select().from(clinics);
    const allInsurances = await db.select().from(insurances);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const clinicMap = new Map(allClinics.map((c) => [c.id, c]));
    const insuranceMap = new Map(allInsurances.map((i) => [i.id, i]));

    for (const t of allTasks) {
      if (t.status === "dropped" && t.bucket !== "done") {
        await db.update(tasks).set({ bucket: "done" }).where(eq(tasks.id, t.id));
        t.bucket = "done";
      }
    }

    const now = new Date();
    return allTasks.map((t) => {
      const isOverdue = t.dueDate && new Date(t.dueDate) < now && t.bucket !== "done";
      let overdueDays = 0;
      if (isOverdue && t.dueDate) {
        overdueDays = Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      }

      let computedPriority = t.priority;
      if (t.ieDate && t.bucket !== "done") {
        const daysSinceIE = Math.floor((now.getTime() - new Date(t.ieDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceIE > 30) {
          computedPriority = "critical";
        } else if (daysSinceIE >= 21) {
          computedPriority = "high";
        } else if (daysSinceIE >= 11) {
          computedPriority = "medium";
        } else {
          computedPriority = "low";
        }
      }

      return {
        ...t,
        priority: computedPriority,
        uploader: t.uploaderId ? userMap.get(t.uploaderId) || null : null,
        clinic: t.clinicId ? clinicMap.get(t.clinicId) || null : null,
        insurance: t.insuranceId ? insuranceMap.get(t.insuranceId) || null : null,
        assignedUser: t.assignedUserId ? userMap.get(t.assignedUserId) || null : null,
        isOverdue: !!isOverdue,
        overdueDays,
        escalationLevel: overdueDays >= 5 ? "admin" : overdueDays >= 3 ? "supervisor" : overdueDays >= 1 ? "employee" : null,
      };
    });
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(data: InsertTask & { uploaderId?: number | null }): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }

  async updateTask(id: number, data: Partial<Task>): Promise<Task | undefined> {
    const [task] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(notifications).where(eq(notifications.taskId, id));
    await db.delete(taskActivity).where(eq(taskActivity.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getTaskActivity(taskId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: taskActivity.id,
        taskId: taskActivity.taskId,
        userId: taskActivity.userId,
        action: taskActivity.action,
        field: taskActivity.field,
        oldValue: taskActivity.oldValue,
        newValue: taskActivity.newValue,
        timestamp: taskActivity.timestamp,
        userName: users.fullName,
      })
      .from(taskActivity)
      .leftJoin(users, eq(taskActivity.userId, users.id))
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(desc(taskActivity.timestamp));
    return rows;
  }

  async getAllTaskActivity(): Promise<any[]> {
    const rows = await db
      .select({
        id: taskActivity.id,
        taskId: taskActivity.taskId,
        userId: taskActivity.userId,
        action: taskActivity.action,
        field: taskActivity.field,
        oldValue: taskActivity.oldValue,
        newValue: taskActivity.newValue,
        timestamp: taskActivity.timestamp,
        userName: users.fullName,
      })
      .from(taskActivity)
      .leftJoin(users, eq(taskActivity.userId, users.id))
      .orderBy(desc(taskActivity.timestamp));
    return rows;
  }

  async createTaskActivity(data: InsertTaskActivity): Promise<TaskActivity> {
    const [activity] = await db.insert(taskActivity).values(data).returning();
    return activity;
  }

  async getNotification(id: number): Promise<Notification | undefined> {
    const [notif] = await db.select().from(notifications).where(eq(notifications.id, id));
    return notif;
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    return notif;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async getAllDenials(): Promise<Denial[]> {
    return db.select().from(denials).orderBy(desc(denials.createdAt));
  }

  async getDenial(id: number): Promise<Denial | undefined> {
    const [denial] = await db.select().from(denials).where(eq(denials.id, id));
    return denial;
  }

  async createDenial(data: InsertDenial): Promise<Denial> {
    const [denial] = await db.insert(denials).values(data).returning();
    return denial;
  }

  async updateDenial(id: number, data: Partial<Denial>): Promise<Denial | undefined> {
    const [denial] = await db.update(denials).set(data).where(eq(denials.id, id)).returning();
    return denial;
  }

  async deleteDenial(id: number): Promise<void> {
    await db.delete(denialActivity).where(eq(denialActivity.denialId, id));
    await db.delete(denials).where(eq(denials.id, id));
  }

  async getDenialActivity(denialId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: denialActivity.id,
        denialId: denialActivity.denialId,
        userId: denialActivity.userId,
        action: denialActivity.action,
        field: denialActivity.field,
        oldValue: denialActivity.oldValue,
        newValue: denialActivity.newValue,
        timestamp: denialActivity.timestamp,
        userName: users.fullName,
      })
      .from(denialActivity)
      .leftJoin(users, eq(denialActivity.userId, users.id))
      .where(eq(denialActivity.denialId, denialId))
      .orderBy(desc(denialActivity.timestamp));
    return rows;
  }

  async createDenialActivity(data: InsertDenialActivity): Promise<DenialActivity> {
    const [activity] = await db.insert(denialActivity).values(data).returning();
    return activity;
  }

  async getAllTickets(): Promise<TicketWithRelations[]> {
    const allTickets = await db.select().from(tickets).orderBy(desc(tickets.createdAt));
    const allUsers = await db.select().from(users);
    const allComments = await db.select().from(ticketComments);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const commentCounts = new Map<number, number>();
    for (const c of allComments) {
      commentCounts.set(c.ticketId, (commentCounts.get(c.ticketId) || 0) + 1);
    }
    return allTickets.map((t) => ({
      ...t,
      createdBy: userMap.get(t.createdById) || null,
      commentCount: commentCounts.get(t.id) || 0,
    }));
  }

  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async createTicket(data: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(data).returning();
    return ticket;
  }

  async updateTicket(id: number, data: Partial<Ticket>): Promise<Ticket | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.status === "done" || data.status === "closed") {
      updateData.completedAt = new Date();
    }
    const [ticket] = await db.update(tickets).set(updateData).where(eq(tickets.id, id)).returning();
    return ticket;
  }

  async deleteTicket(id: number): Promise<void> {
    await db.delete(ticketComments).where(eq(ticketComments.ticketId, id));
    await db.delete(tickets).where(eq(tickets.id, id));
  }

  async getTicketComments(ticketId: number): Promise<TicketCommentWithUser[]> {
    const comments = await db
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(ticketComments.createdAt);
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    return comments.map((c) => ({
      ...c,
      user: userMap.get(c.userId) || null,
    }));
  }

  async createTicketComment(data: InsertTicketComment): Promise<TicketComment> {
    const [comment] = await db.insert(ticketComments).values(data).returning();
    return comment;
  }
}

export const storage = new DatabaseStorage();
