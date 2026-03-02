import { eq, and, desc, sql } from "drizzle-orm";
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
  ticketActivity,
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
  type InsertTicketActivity,
  type TicketActivityWithUser,
  arbitrations,
  arbitrationActivity,
  type Arbitration,
  type InsertArbitration,
  type ArbitrationActivity,
  type InsertArbitrationActivity,
  collections,
  collectionActivity,
  type Collection,
  type InsertCollection,
  type CollectionActivity,
  type InsertCollectionActivity,
  announcements,
  announcementAcks,
  directMessages,
  type Announcement,
  type InsertAnnouncement,
  type AnnouncementAck,
  type DirectMessage,
  type InsertDirectMessage,
  type AnnouncementWithRelations,
  type DirectMessageWithUser,
  dropdownOptions,
  type DropdownOption,
  type InsertDropdownOption,
  postings,
  postingActivity,
  type Posting,
  type InsertPosting,
  type PostingActivity,
  type InsertPostingActivity,
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

  getAllArbitrations(): Promise<Arbitration[]>;
  getArbitration(id: number): Promise<Arbitration | undefined>;
  createArbitration(data: InsertArbitration): Promise<Arbitration>;
  updateArbitration(id: number, data: Partial<Arbitration>): Promise<Arbitration | undefined>;
  deleteArbitration(id: number): Promise<void>;
  getArbitrationActivity(arbitrationId: number): Promise<any[]>;
  createArbitrationActivity(data: InsertArbitrationActivity): Promise<ArbitrationActivity>;

  getAllCollections(): Promise<Collection[]>;
  getCollection(id: number): Promise<Collection | undefined>;
  createCollection(data: InsertCollection): Promise<Collection>;
  updateCollection(id: number, data: Partial<Collection>): Promise<Collection | undefined>;
  deleteCollection(id: number): Promise<void>;
  getCollectionActivity(collectionId: number): Promise<any[]>;
  createCollectionActivity(data: InsertCollectionActivity): Promise<CollectionActivity>;

  getAllPostings(): Promise<Posting[]>;
  getPosting(id: number): Promise<Posting | undefined>;
  createPosting(data: InsertPosting): Promise<Posting>;
  updatePosting(id: number, data: Partial<Posting>): Promise<Posting | undefined>;
  deletePosting(id: number): Promise<void>;
  getPostingActivity(postingId: number): Promise<any[]>;
  createPostingActivity(data: InsertPostingActivity): Promise<PostingActivity>;

  getAllTickets(): Promise<TicketWithRelations[]>;
  getTicket(id: number): Promise<Ticket | undefined>;
  createTicket(data: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, data: Partial<Ticket>): Promise<Ticket | undefined>;
  deleteTicket(id: number): Promise<void>;
  getTicketComments(ticketId: number): Promise<TicketCommentWithUser[]>;
  createTicketComment(data: InsertTicketComment): Promise<TicketComment>;
  getTicketActivity(ticketId: number): Promise<TicketActivityWithUser[]>;
  createTicketActivity(data: InsertTicketActivity): Promise<any>;

  getAllAnnouncements(): Promise<AnnouncementWithRelations[]>;
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  deleteAnnouncement(id: number): Promise<void>;
  acknowledgeAnnouncement(announcementId: number, userId: number): Promise<void>;
  getAnnouncementAcks(announcementId: number): Promise<(AnnouncementAck & { user?: User | null })[]>;

  getDirectMessages(userId: number, otherUserId: number): Promise<DirectMessageWithUser[]>;
  getConversations(userId: number): Promise<any[]>;
  createDirectMessage(data: InsertDirectMessage): Promise<DirectMessage>;
  markMessagesRead(userId: number, otherUserId: number): Promise<void>;
  getUnreadMessageCount(userId: number): Promise<number>;
  getDropdownOptionsByCategory(category: string): Promise<DropdownOption[]>;
  getAllDropdownOptions(): Promise<DropdownOption[]>;
  createDropdownOption(data: InsertDropdownOption): Promise<DropdownOption>;
  updateDropdownOption(id: number, data: Partial<InsertDropdownOption>): Promise<DropdownOption | undefined>;
  deleteDropdownOption(id: number): Promise<void>;
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

  async getAllArbitrations(): Promise<Arbitration[]> {
    return db.select().from(arbitrations).orderBy(desc(arbitrations.createdAt));
  }

  async getArbitration(id: number): Promise<Arbitration | undefined> {
    const [a] = await db.select().from(arbitrations).where(eq(arbitrations.id, id));
    return a;
  }

  async createArbitration(data: InsertArbitration): Promise<Arbitration> {
    const [a] = await db.insert(arbitrations).values(data).returning();
    return a;
  }

  async updateArbitration(id: number, data: Partial<Arbitration>): Promise<Arbitration | undefined> {
    const [a] = await db.update(arbitrations).set(data).where(eq(arbitrations.id, id)).returning();
    return a;
  }

  async deleteArbitration(id: number): Promise<void> {
    await db.delete(arbitrationActivity).where(eq(arbitrationActivity.arbitrationId, id));
    await db.delete(arbitrations).where(eq(arbitrations.id, id));
  }

  async getArbitrationActivity(arbitrationId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: arbitrationActivity.id,
        arbitrationId: arbitrationActivity.arbitrationId,
        userId: arbitrationActivity.userId,
        action: arbitrationActivity.action,
        field: arbitrationActivity.field,
        oldValue: arbitrationActivity.oldValue,
        newValue: arbitrationActivity.newValue,
        timestamp: arbitrationActivity.timestamp,
        userName: users.fullName,
      })
      .from(arbitrationActivity)
      .leftJoin(users, eq(arbitrationActivity.userId, users.id))
      .where(eq(arbitrationActivity.arbitrationId, arbitrationId))
      .orderBy(desc(arbitrationActivity.timestamp));
    return rows;
  }

  async createArbitrationActivity(data: InsertArbitrationActivity): Promise<ArbitrationActivity> {
    const [activity] = await db.insert(arbitrationActivity).values(data).returning();
    return activity;
  }

  async getAllCollections(): Promise<Collection[]> {
    return db.select().from(collections).orderBy(desc(collections.createdAt));
  }

  async getCollection(id: number): Promise<Collection | undefined> {
    const [c] = await db.select().from(collections).where(eq(collections.id, id));
    return c;
  }

  async createCollection(data: InsertCollection): Promise<Collection> {
    const [c] = await db.insert(collections).values(data).returning();
    return c;
  }

  async updateCollection(id: number, data: Partial<Collection>): Promise<Collection | undefined> {
    const [c] = await db.update(collections).set(data).where(eq(collections.id, id)).returning();
    return c;
  }

  async deleteCollection(id: number): Promise<void> {
    await db.delete(collectionActivity).where(eq(collectionActivity.collectionId, id));
    await db.delete(collections).where(eq(collections.id, id));
  }

  async getCollectionActivity(collectionId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: collectionActivity.id,
        collectionId: collectionActivity.collectionId,
        userId: collectionActivity.userId,
        action: collectionActivity.action,
        field: collectionActivity.field,
        oldValue: collectionActivity.oldValue,
        newValue: collectionActivity.newValue,
        timestamp: collectionActivity.timestamp,
        userName: users.fullName,
      })
      .from(collectionActivity)
      .leftJoin(users, eq(collectionActivity.userId, users.id))
      .where(eq(collectionActivity.collectionId, collectionId))
      .orderBy(desc(collectionActivity.timestamp));
    return rows;
  }

  async createCollectionActivity(data: InsertCollectionActivity): Promise<CollectionActivity> {
    const [activity] = await db.insert(collectionActivity).values(data).returning();
    return activity;
  }

  async getAllPostings(): Promise<Posting[]> {
    return db.select().from(postings).orderBy(desc(postings.createdAt));
  }

  async getPosting(id: number): Promise<Posting | undefined> {
    const [posting] = await db.select().from(postings).where(eq(postings.id, id));
    return posting;
  }

  async createPosting(data: InsertPosting): Promise<Posting> {
    const [posting] = await db.insert(postings).values(data).returning();
    return posting;
  }

  async updatePosting(id: number, data: Partial<Posting>): Promise<Posting | undefined> {
    const [posting] = await db.update(postings).set(data).where(eq(postings.id, id)).returning();
    return posting;
  }

  async deletePosting(id: number): Promise<void> {
    await db.delete(postingActivity).where(eq(postingActivity.postingId, id));
    await db.delete(postings).where(eq(postings.id, id));
  }

  async getPostingActivity(postingId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: postingActivity.id,
        postingId: postingActivity.postingId,
        userId: postingActivity.userId,
        action: postingActivity.action,
        field: postingActivity.field,
        oldValue: postingActivity.oldValue,
        newValue: postingActivity.newValue,
        timestamp: postingActivity.timestamp,
        userName: users.fullName,
      })
      .from(postingActivity)
      .leftJoin(users, eq(postingActivity.userId, users.id))
      .where(eq(postingActivity.postingId, postingId))
      .orderBy(desc(postingActivity.timestamp));
    return rows;
  }

  async createPostingActivity(data: InsertPostingActivity): Promise<PostingActivity> {
    const [activity] = await db.insert(postingActivity).values(data).returning();
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
    await db.delete(ticketActivity).where(eq(ticketActivity.ticketId, id));
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

  async getTicketActivity(ticketId: number): Promise<TicketActivityWithUser[]> {
    const rows = await db
      .select({
        id: ticketActivity.id,
        ticketId: ticketActivity.ticketId,
        userId: ticketActivity.userId,
        action: ticketActivity.action,
        field: ticketActivity.field,
        oldValue: ticketActivity.oldValue,
        newValue: ticketActivity.newValue,
        timestamp: ticketActivity.timestamp,
        userName: users.fullName,
      })
      .from(ticketActivity)
      .leftJoin(users, eq(ticketActivity.userId, users.id))
      .where(eq(ticketActivity.ticketId, ticketId))
      .orderBy(desc(ticketActivity.timestamp));
    return rows.map((r) => ({
      ...r,
      user: r.userName ? { fullName: r.userName } as any : null,
    }));
  }

  async createTicketActivity(data: InsertTicketActivity): Promise<any> {
    const [activity] = await db.insert(ticketActivity).values(data).returning();
    return activity;
  }

  async getAllAnnouncements(): Promise<AnnouncementWithRelations[]> {
    const allAnnouncements = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
    const allUsers = await db.select().from(users);
    const allAcks = await db.select().from(announcementAcks);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    return allAnnouncements.map(a => {
      const acks = allAcks.filter(ak => ak.announcementId === a.id).map(ak => ({
        ...ak,
        user: userMap.get(ak.userId) || null,
      }));
      let totalRecipients = 0;
      if (a.targetType === "all") {
        totalRecipients = allUsers.filter(u => u.active !== false).length;
      } else if (a.targetType === "role" && a.targetRoles) {
        totalRecipients = allUsers.filter(u => u.active !== false && a.targetRoles!.includes(u.role)).length;
      } else if (a.targetType === "users" && a.targetUserIds) {
        totalRecipients = a.targetUserIds.length;
      }
      return {
        ...a,
        author: userMap.get(a.authorId) || null,
        acks,
        totalRecipients,
        readCount: acks.length,
      };
    });
  }

  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [a] = await db.insert(announcements).values(data).returning();
    return a;
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcementAcks).where(eq(announcementAcks.announcementId, id));
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  async acknowledgeAnnouncement(announcementId: number, userId: number): Promise<void> {
    const existing = await db.select().from(announcementAcks)
      .where(and(eq(announcementAcks.announcementId, announcementId), eq(announcementAcks.userId, userId)));
    if (existing.length === 0) {
      await db.insert(announcementAcks).values({ announcementId, userId });
    }
  }

  async getAnnouncementAcks(announcementId: number): Promise<(AnnouncementAck & { user?: User | null })[]> {
    const acks = await db.select().from(announcementAcks).where(eq(announcementAcks.announcementId, announcementId));
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    return acks.map(a => ({ ...a, user: userMap.get(a.userId) || null }));
  }

  async getDirectMessages(userId: number, otherUserId: number): Promise<DirectMessageWithUser[]> {
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const msgs = await db.select().from(directMessages)
      .where(
        sql`(${directMessages.senderId} = ${userId} AND ${directMessages.recipientId} = ${otherUserId})
        OR (${directMessages.senderId} = ${otherUserId} AND ${directMessages.recipientId} = ${userId})`
      )
      .orderBy(directMessages.createdAt);
    return msgs.map(m => ({
      ...m,
      sender: userMap.get(m.senderId) || null,
      recipient: userMap.get(m.recipientId) || null,
    }));
  }

  async getConversations(userId: number): Promise<any[]> {
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const msgs = await db.select().from(directMessages)
      .where(sql`${directMessages.senderId} = ${userId} OR ${directMessages.recipientId} = ${userId}`)
      .orderBy(desc(directMessages.createdAt));
    const convMap = new Map<number, { otherUser: User; lastMessage: DirectMessage; unreadCount: number }>();
    for (const m of msgs) {
      const otherId = m.senderId === userId ? m.recipientId : m.senderId;
      if (!convMap.has(otherId)) {
        const unread = msgs.filter(msg => msg.senderId === otherId && msg.recipientId === userId && !msg.readAt).length;
        convMap.set(otherId, {
          otherUser: userMap.get(otherId) as User,
          lastMessage: m,
          unreadCount: unread,
        });
      }
    }
    return Array.from(convMap.values());
  }

  async createDirectMessage(data: InsertDirectMessage): Promise<DirectMessage> {
    const [msg] = await db.insert(directMessages).values(data).returning();
    return msg;
  }

  async markMessagesRead(userId: number, otherUserId: number): Promise<void> {
    await db.update(directMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(directMessages.senderId, otherUserId),
          eq(directMessages.recipientId, userId),
          sql`${directMessages.readAt} IS NULL`
        )
      );
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(directMessages)
      .where(and(eq(directMessages.recipientId, userId), sql`${directMessages.readAt} IS NULL`));
    return Number(result[0]?.count || 0);
  }

  async getDropdownOptionsByCategory(category: string): Promise<DropdownOption[]> {
    return db.select().from(dropdownOptions)
      .where(eq(dropdownOptions.category, category))
      .orderBy(dropdownOptions.value);
  }

  async getAllDropdownOptions(): Promise<DropdownOption[]> {
    return db.select().from(dropdownOptions).orderBy(dropdownOptions.category, dropdownOptions.value);
  }

  async createDropdownOption(data: InsertDropdownOption): Promise<DropdownOption> {
    const [opt] = await db.insert(dropdownOptions).values(data).returning();
    return opt;
  }

  async updateDropdownOption(id: number, data: Partial<InsertDropdownOption>): Promise<DropdownOption | undefined> {
    const [opt] = await db.update(dropdownOptions).set(data).where(eq(dropdownOptions.id, id)).returning();
    return opt;
  }

  async deleteDropdownOption(id: number): Promise<void> {
    await db.delete(dropdownOptions).where(eq(dropdownOptions.id, id));
  }
}

export const storage = new DatabaseStorage();
