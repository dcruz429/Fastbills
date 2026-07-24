import { eq, and, desc, asc, sql, gte, lte, between } from "drizzle-orm";
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
  scheduledCalls,
  callAttempts,
  callActivity,
  teams,
  userTeams,
  type Team,
  type InsertTeam,
  type UserTeam,
  type TeamWithMembers,
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
  checks,
  checkActivity,
  type Check,
  type InsertCheck,
  type CheckActivity,
  type InsertCheckActivity,
  closed,
  closedActivity,
  type Closed,
  type InsertClosed,
  type ClosedActivity,
  type InsertClosedActivity,
  ceoBox,
  type CeoBox,
  type InsertCeoBox,
  DR_AL_NAME,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getAllTeams(): Promise<Team[]>;
  getTeamsWithMembers(): Promise<TeamWithMembers[]>;
  createTeam(data: InsertTeam): Promise<Team>;
  updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: number): Promise<void>;
  addUserToTeam(teamId: number, userId: number): Promise<UserTeam>;
  removeUserFromTeam(teamId: number, userId: number): Promise<void>;
  getUserTeams(userId: number): Promise<Team[]>;

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

  getAllChecks(): Promise<Check[]>;
  getCheck(id: number): Promise<Check | undefined>;
  createCheck(data: InsertCheck): Promise<Check>;
  updateCheck(id: number, data: Partial<Check>): Promise<Check | undefined>;
  deleteCheck(id: number): Promise<void>;
  getCheckActivity(checkId: number): Promise<any[]>;
  createCheckActivity(data: InsertCheckActivity): Promise<CheckActivity>;

  getAllClosed(): Promise<Closed[]>;
  getClosed(id: number): Promise<Closed | undefined>;
  createClosed(data: InsertClosed): Promise<Closed>;
  syncClosedFromSource(source: string, sourceId: number, patch: Partial<Closed>): Promise<void>;
  updateClosed(id: number, data: Partial<Closed>): Promise<Closed | undefined>;
  deleteClosed(id: number): Promise<void>;
  getClosedActivity(closedId: number): Promise<any[]>;
  createClosedActivity(data: InsertClosedActivity): Promise<ClosedActivity>;

  getCeoBoxRecords(currentUserId: number, currentUserName: string): Promise<(CeoBox & { creatorName?: string })[]>;
  getCeoBoxRecord(id: number): Promise<CeoBox | undefined>;
  createCeoBoxRecord(data: Partial<CeoBox>, userId: number): Promise<CeoBox>;
  updateCeoBoxRecord(id: number, data: Partial<CeoBox>): Promise<CeoBox | undefined>;
  deleteCeoBoxRecord(id: number): Promise<void>;

  getScheduledCalls(filters?: { dateFrom?: Date; dateTo?: Date; assignedUserId?: number; callStatus?: string; department?: string; }): Promise<any[]>;
  getScheduledCall(id: number): Promise<any | undefined>;
  createScheduledCall(data: any): Promise<any>;
  updateScheduledCall(id: number, data: any): Promise<any | undefined>;
  deleteScheduledCall(id: number): Promise<void>;
  getCallAttempts(callId: number): Promise<any[]>;
  createCallAttempt(data: any): Promise<any>;
  getCallActivityLog(callId: number): Promise<any[]>;
  createCallActivity(data: any): Promise<any>;
  getPatientDailySchedule(userId: number, userFullName: string, dateStr: string): Promise<any[]>;
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
    return db.select().from(insurances).orderBy(asc(insurances.name));
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
      .orderBy(dropdownOptions.sortOrder, dropdownOptions.value);
  }

  async getAllDropdownOptions(): Promise<DropdownOption[]> {
    return db.select().from(dropdownOptions).orderBy(dropdownOptions.category, dropdownOptions.sortOrder, dropdownOptions.value);
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

  async getAllChecks(): Promise<Check[]> {
    return db.select().from(checks).orderBy(desc(checks.createdAt));
  }

  async getCheck(id: number): Promise<Check | undefined> {
    const [check] = await db.select().from(checks).where(eq(checks.id, id));
    return check;
  }

  async createCheck(data: InsertCheck): Promise<Check> {
    const [check] = await db.insert(checks).values(data).returning();
    return check;
  }

  async updateCheck(id: number, data: Partial<Check>): Promise<Check | undefined> {
    const [check] = await db.update(checks).set(data).where(eq(checks.id, id)).returning();
    return check;
  }

  async deleteCheck(id: number): Promise<void> {
    await db.delete(checkActivity).where(eq(checkActivity.checkId, id));
    await db.delete(checks).where(eq(checks.id, id));
  }

  async getCheckActivity(checkId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: checkActivity.id,
        checkId: checkActivity.checkId,
        userId: checkActivity.userId,
        action: checkActivity.action,
        field: checkActivity.field,
        oldValue: checkActivity.oldValue,
        newValue: checkActivity.newValue,
        timestamp: checkActivity.timestamp,
        userName: users.fullName,
      })
      .from(checkActivity)
      .leftJoin(users, eq(checkActivity.userId, users.id))
      .where(eq(checkActivity.checkId, checkId))
      .orderBy(desc(checkActivity.timestamp));
    return rows;
  }

  async createCheckActivity(data: InsertCheckActivity): Promise<CheckActivity> {
    const [activity] = await db.insert(checkActivity).values(data).returning();
    return activity;
  }

  async getAllClosed(): Promise<Closed[]> {
    return db.select().from(closed).orderBy(desc(closed.createdAt));
  }

  async getClosed(id: number): Promise<Closed | undefined> {
    const [record] = await db.select().from(closed).where(eq(closed.id, id));
    return record;
  }

  async createClosed(data: InsertClosed): Promise<Closed> {
    const [record] = await db.insert(closed).values(data).returning();
    return record;
  }

  async syncClosedFromSource(source: string, sourceId: number, patch: Partial<Closed>): Promise<void> {
    const byId = await db.select().from(closed).where(and(eq(closed.source, source), eq(closed.sourceId, sourceId)));
    if (byId.length > 0) {
      await db.update(closed).set(patch).where(and(eq(closed.source, source), eq(closed.sourceId, sourceId)));
    } else if (patch.patientName) {
      const byName = await db.select().from(closed).where(and(eq(closed.source, source), eq(closed.patientName, patch.patientName)));
      if (byName.length > 0) {
        await db.update(closed).set(patch).where(and(eq(closed.source, source), eq(closed.patientName, patch.patientName)));
      }
    }
  }

  async updateClosed(id: number, data: Partial<Closed>): Promise<Closed | undefined> {
    const [record] = await db.update(closed).set(data).where(eq(closed.id, id)).returning();
    return record;
  }

  async deleteClosed(id: number): Promise<void> {
    await db.delete(closedActivity).where(eq(closedActivity.closedId, id));
    await db.delete(closed).where(eq(closed.id, id));
  }

  async getClosedActivity(closedId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: closedActivity.id,
        closedId: closedActivity.closedId,
        userId: closedActivity.userId,
        action: closedActivity.action,
        field: closedActivity.field,
        oldValue: closedActivity.oldValue,
        newValue: closedActivity.newValue,
        timestamp: closedActivity.timestamp,
        userName: users.fullName,
      })
      .from(closedActivity)
      .leftJoin(users, eq(closedActivity.userId, users.id))
      .where(eq(closedActivity.closedId, closedId))
      .orderBy(desc(closedActivity.timestamp));
    return rows;
  }

  async createClosedActivity(data: InsertClosedActivity): Promise<ClosedActivity> {
    const [activity] = await db.insert(closedActivity).values(data).returning();
    return activity;
  }

  async getCeoBoxRecords(currentUserId: number, currentUserName: string): Promise<(CeoBox & { creatorName?: string })[]> {
    const rows = await db
      .select({
        id: ceoBox.id,
        work: ceoBox.work,
        dateOfLetter: ceoBox.dateOfLetter,
        sender: ceoBox.sender,
        company: ceoBox.company,
        clinic: ceoBox.clinic,
        action: ceoBox.action,
        status: ceoBox.status,
        dueDate: ceoBox.dueDate,
        priority: ceoBox.priority,
        attachments: ceoBox.attachments,
        notes: ceoBox.notes,
        confidential: ceoBox.confidential,
        createdById: ceoBox.createdById,
        createdAt: ceoBox.createdAt,
        updatedAt: ceoBox.updatedAt,
        creatorName: users.fullName,
      })
      .from(ceoBox)
      .leftJoin(users, eq(ceoBox.createdById, users.id))
      .orderBy(desc(ceoBox.createdAt));

    return rows.filter(r => {
      if (r.confidential && currentUserName !== DR_AL_NAME) return false;
      return true;
    }) as (CeoBox & { creatorName?: string })[];
  }

  async getCeoBoxRecord(id: number): Promise<CeoBox | undefined> {
    const [row] = await db.select().from(ceoBox).where(eq(ceoBox.id, id));
    return row;
  }

  async createCeoBoxRecord(data: Partial<CeoBox>, userId: number): Promise<CeoBox> {
    const [row] = await db.insert(ceoBox).values({ ...data, createdById: userId, status: data.status || "todo", priority: data.priority || "medium" } as any).returning();
    return row;
  }

  async updateCeoBoxRecord(id: number, data: Partial<CeoBox>): Promise<CeoBox | undefined> {
    const [row] = await db.update(ceoBox).set({ ...data, updatedAt: new Date() }).where(eq(ceoBox.id, id)).returning();
    return row;
  }

  async deleteCeoBoxRecord(id: number): Promise<void> {
    await db.delete(ceoBox).where(eq(ceoBox.id, id));
  }

  async getScheduledCalls(filters?: { dateFrom?: Date; dateTo?: Date; assignedUserId?: number; callStatus?: string; department?: string; }): Promise<any[]> {
    const rows = await db
      .select({
        id: scheduledCalls.id,
        patientName: scheduledCalls.patientName,
        relatedTaskId: scheduledCalls.relatedTaskId,
        department: scheduledCalls.department,
        assignedUserId: scheduledCalls.assignedUserId,
        createdByUserId: scheduledCalls.createdByUserId,
        scheduledAt: scheduledCalls.scheduledAt,
        timezone: scheduledCalls.timezone,
        callReason: scheduledCalls.callReason,
        priority: scheduledCalls.priority,
        callStatus: scheduledCalls.callStatus,
        phoneNumber: scheduledCalls.phoneNumber,
        notes: scheduledCalls.notes,
        parentCallId: scheduledCalls.parentCallId,
        completedAt: scheduledCalls.completedAt,
        cancelledAt: scheduledCalls.cancelledAt,
        cancellationReason: scheduledCalls.cancellationReason,
        clinic: scheduledCalls.clinic,
        insurance: scheduledCalls.insurance,
        createdAt: scheduledCalls.createdAt,
        updatedAt: scheduledCalls.updatedAt,
        assignedUserName: users.fullName,
      })
      .from(scheduledCalls)
      .leftJoin(users, eq(scheduledCalls.assignedUserId, users.id))
      .orderBy(asc(scheduledCalls.scheduledAt));

    return rows.filter((r: any) => {
      if (filters?.dateFrom && r.scheduledAt < filters.dateFrom) return false;
      if (filters?.dateTo && r.scheduledAt > filters.dateTo) return false;
      if (filters?.assignedUserId && r.assignedUserId !== filters.assignedUserId) return false;
      if (filters?.callStatus && r.callStatus !== filters.callStatus) return false;
      if (filters?.department && r.department !== filters.department) return false;
      return true;
    });
  }

  async getScheduledCall(id: number): Promise<any | undefined> {
    const rows = await db
      .select({
        id: scheduledCalls.id,
        patientName: scheduledCalls.patientName,
        relatedTaskId: scheduledCalls.relatedTaskId,
        department: scheduledCalls.department,
        assignedUserId: scheduledCalls.assignedUserId,
        createdByUserId: scheduledCalls.createdByUserId,
        scheduledAt: scheduledCalls.scheduledAt,
        timezone: scheduledCalls.timezone,
        callReason: scheduledCalls.callReason,
        priority: scheduledCalls.priority,
        callStatus: scheduledCalls.callStatus,
        phoneNumber: scheduledCalls.phoneNumber,
        notes: scheduledCalls.notes,
        parentCallId: scheduledCalls.parentCallId,
        completedAt: scheduledCalls.completedAt,
        cancelledAt: scheduledCalls.cancelledAt,
        cancellationReason: scheduledCalls.cancellationReason,
        clinic: scheduledCalls.clinic,
        insurance: scheduledCalls.insurance,
        createdAt: scheduledCalls.createdAt,
        updatedAt: scheduledCalls.updatedAt,
        assignedUserName: users.fullName,
      })
      .from(scheduledCalls)
      .leftJoin(users, eq(scheduledCalls.assignedUserId, users.id))
      .where(eq(scheduledCalls.id, id));
    return rows[0];
  }

  async createScheduledCall(data: any): Promise<any> {
    const [row] = await db.insert(scheduledCalls).values(data).returning();
    return row;
  }

  async updateScheduledCall(id: number, data: any): Promise<any | undefined> {
    const [row] = await db.update(scheduledCalls).set({ ...data, updatedAt: new Date() }).where(eq(scheduledCalls.id, id)).returning();
    return row;
  }

  async deleteScheduledCall(id: number): Promise<void> {
    await db.delete(callActivity).where(eq(callActivity.scheduledCallId, id));
    await db.delete(callAttempts).where(eq(callAttempts.scheduledCallId, id));
    await db.delete(scheduledCalls).where(eq(scheduledCalls.id, id));
  }

  async getCallAttempts(callId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: callAttempts.id,
        scheduledCallId: callAttempts.scheduledCallId,
        attemptedByUserId: callAttempts.attemptedByUserId,
        startedAt: callAttempts.startedAt,
        endedAt: callAttempts.endedAt,
        durationSeconds: callAttempts.durationSeconds,
        outcome: callAttempts.outcome,
        contactPerson: callAttempts.contactPerson,
        notes: callAttempts.notes,
        followUpRequired: callAttempts.followUpRequired,
        nextScheduledCallId: callAttempts.nextScheduledCallId,
        createdAt: callAttempts.createdAt,
        userName: users.fullName,
      })
      .from(callAttempts)
      .leftJoin(users, eq(callAttempts.attemptedByUserId, users.id))
      .where(eq(callAttempts.scheduledCallId, callId))
      .orderBy(desc(callAttempts.createdAt));
    return rows;
  }

  async createCallAttempt(data: any): Promise<any> {
    const [row] = await db.insert(callAttempts).values(data).returning();
    return row;
  }

  async getCallActivityLog(callId: number): Promise<any[]> {
    const rows = await db
      .select({
        id: callActivity.id,
        scheduledCallId: callActivity.scheduledCallId,
        callAttemptId: callActivity.callAttemptId,
        actorUserId: callActivity.actorUserId,
        eventType: callActivity.eventType,
        oldValues: callActivity.oldValues,
        newValues: callActivity.newValues,
        createdAt: callActivity.createdAt,
        userName: users.fullName,
      })
      .from(callActivity)
      .leftJoin(users, eq(callActivity.actorUserId, users.id))
      .where(eq(callActivity.scheduledCallId, callId))
      .orderBy(desc(callActivity.createdAt));
    return rows;
  }

  async createCallActivity(data: any): Promise<any> {
    const [row] = await db.insert(callActivity).values(data).returning();
    return row;
  }

  async getAllTeams(): Promise<Team[]> {
    return db.select().from(teams).orderBy(asc(teams.name));
  }

  async getTeamsWithMembers(): Promise<TeamWithMembers[]> {
    const allTeams = await db.select().from(teams).orderBy(asc(teams.name));
    const allMembers = await db
      .select({ teamId: userTeams.teamId, id: users.id, fullName: users.fullName, role: users.role })
      .from(userTeams)
      .innerJoin(users, eq(userTeams.userId, users.id));
    return allTeams.map((t) => ({
      ...t,
      members: allMembers.filter((m) => m.teamId === t.id).map(({ id, fullName, role }) => ({ id, fullName, role })),
    }));
  }

  async createTeam(data: InsertTeam): Promise<Team> {
    const [row] = await db.insert(teams).values(data).returning();
    return row;
  }

  async updateTeam(id: number, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [row] = await db.update(teams).set(data).where(eq(teams.id, id)).returning();
    return row;
  }

  async deleteTeam(id: number): Promise<void> {
    await db.delete(userTeams).where(eq(userTeams.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  async addUserToTeam(teamId: number, userId: number): Promise<UserTeam> {
    const existing = await db.select().from(userTeams).where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)));
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(userTeams).values({ teamId, userId }).returning();
    return row;
  }

  async removeUserFromTeam(teamId: number, userId: number): Promise<void> {
    await db.delete(userTeams).where(and(eq(userTeams.teamId, teamId), eq(userTeams.userId, userId)));
  }

  async getUserTeams(userId: number): Promise<Team[]> {
    const rows = await db
      .select({ id: teams.id, name: teams.name })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(eq(userTeams.userId, userId))
      .orderBy(asc(teams.name));
    return rows;
  }

  async getPatientDailySchedule(userId: number, userFullName: string, dateStr: string): Promise<any[]> {
    const [y, m, d] = dateStr.split("-").map(Number);
    const target = new Date(y, m - 1, d);
    const dow = target.getDay();
    if (dow === 0 || dow === 6) return [];

    const START = new Date(2026, 6, 27);
    if (target < START) return [];

    // Count working days from START (inclusive=0) up to (but not including) target
    let dayIndex = 0;
    const cur = new Date(START);
    while (cur < target) {
      cur.setDate(cur.getDate() + 1);
      if (cur.getDay() !== 0 && cur.getDay() !== 6) dayIndex++;
    }

    const DAILY = 40;

    const [taskRows, collRows, denRows, arbRows, postRows, chkRows] = await Promise.all([
      db.select({
        sourceId: tasks.id, patientName: tasks.patientName,
        clinic: clinics.name, insurance: insurances.name,
        department: sql<string>`'Verification'`, createdAt: tasks.createdAt, status: tasks.status,
      }).from(tasks)
        .leftJoin(clinics, eq(tasks.clinicId, clinics.id))
        .leftJoin(insurances, eq(tasks.insuranceId, insurances.id))
        .where(and(eq(tasks.assignedUserId, userId), sql`${tasks.status} NOT IN ('done','dropped')`)),

      db.select({
        sourceId: collections.id, patientName: collections.patientName,
        clinic: collections.clinic, insurance: collections.insurance,
        department: sql<string>`'Collections'`, createdAt: collections.createdAt, status: collections.status,
      }).from(collections)
        .where(and(eq(collections.assignedTo, userFullName), sql`(${collections.status} IS NULL OR ${collections.status} != 'Done')`)),

      db.select({
        sourceId: denials.id, patientName: denials.patientName,
        clinic: denials.clinic, insurance: denials.insurance,
        department: sql<string>`'Denials'`, createdAt: denials.createdAt, status: denials.status,
      }).from(denials)
        .where(and(eq(denials.assignedTo, userFullName), sql`(${denials.status} IS NULL OR ${denials.status} != 'Done')`)),

      db.select({
        sourceId: arbitrations.id, patientName: arbitrations.patientName,
        clinic: arbitrations.clinic, insurance: arbitrations.insurance,
        department: sql<string>`'Arbitration'`, createdAt: arbitrations.createdAt, status: arbitrations.status,
      }).from(arbitrations)
        .where(and(eq(arbitrations.assignedTo, userFullName), sql`(${arbitrations.status} IS NULL OR ${arbitrations.status} != 'Done')`)),

      db.select({
        sourceId: postings.id, patientName: postings.patientName,
        clinic: postings.clinic, insurance: postings.insurance,
        department: sql<string>`'Posting'`, createdAt: postings.createdAt, status: postings.status,
      }).from(postings)
        .where(and(eq(postings.assignedTo, userFullName), sql`(${postings.status} IS NULL OR ${postings.status} != 'Done')`)),

      db.select({
        sourceId: checks.id, patientName: checks.patientName,
        clinic: checks.clinic, insurance: checks.insurance,
        department: sql<string>`'Checks'`, createdAt: checks.createdAt, status: checks.status,
      }).from(checks)
        .where(and(eq(checks.assignedTo, userFullName), sql`(${checks.status} IS NULL OR ${checks.status} != 'Done')`)),
    ]);

    const all = [...taskRows, ...collRows, ...denRows, ...arbRows, ...postRows, ...chkRows]
      .filter(r => r.patientName)
      .sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime());

    return all.slice(dayIndex * DAILY, (dayIndex + 1) * DAILY);
  }
}

export const storage = new DatabaseStorage();
