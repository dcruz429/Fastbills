import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "verifier", "biller", "assigner", "manager"]);
export const bucketEnum = pgEnum("bucket", ["for_verification", "ready_for_billing", "done"]);
export const statusEnum = pgEnum("status", ["working_on_it", "billed", "done", "dropped", "assigned", "unassigned", "verified"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "critical"]);

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  role: roleEnum("role").notNull().default("verifier"),
  active: boolean("active").notNull().default(true),
});

export const clinics = pgTable("clinics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
});

export const insurances = pgTable("insurances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
});

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  patientName: text("patient_name").notNull(),
  chartNumber: text("chart_number"),
  inputDate: timestamp("input_date").notNull().defaultNow(),
  uploaderId: integer("uploader_id").references(() => users.id),
  clinicId: integer("clinic_id").references(() => clinics.id),
  ieDate: timestamp("ie_date"),
  dueDate: timestamp("due_date"),
  priority: priorityEnum("priority").notNull().default("low"),
  insuranceId: integer("insurance_id").references(() => insurances.id),
  status: statusEnum("status").notNull().default("unassigned"),
  bucket: bucketEnum("bucket").notNull().default("for_verification"),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  notes: text("notes"),
  rtp: boolean("rtp").notNull().default(false),
  resolutionDate: timestamp("resolution_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const taskActivity = pgTable("task_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("task_id").notNull().references(() => tasks.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const denials = pgTable("denials", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  denialFileName: text("denial_file_name"),
  dateInput: timestamp("date_input").defaultNow(),
  intake: text("intake"),
  doa: timestamp("doa"),
  clinic: text("clinic"),
  patientName: text("patient_name").notNull(),
  insurance: text("insurance"),
  dateOfLetter: timestamp("date_of_letter"),
  typeOfDenial: text("type_of_denial"),
  effectiveDate: timestamp("effective_date"),
  dosFrom: timestamp("dos_from"),
  dosTo: timestamp("dos_to"),
  numberOfDays: integer("number_of_days"),
  amount: text("amount"),
  comments: text("comments"),
  filedTo: text("filed_to"),
  arbStatus: text("arb_status"),
  trialDate: timestamp("trial_date"),
  arbPaymentStatus: text("arb_payment_status"),
  amountReceived: text("amount_received"),
  checkedBy: text("checked_by"),
  comment: text("comment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const denialActivity = pgTable("denial_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  denialId: integer("denial_id").notNull().references(() => denials.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const DENIAL_TYPE_OPTIONS = [
  "Policy Canceled",
  "Pending IME",
  "EUO Provider NC",
  "IME Non Compliant",
  "Pending EUO Patient",
  "Pending Investigation",
];

export const FILED_TO_OPTIONS = [
  "Moroff",
  "AAA",
  "Court",
  "Internal",
];

export const ARB_STATUS_OPTIONS = [
  "Pending",
  "Scheduled",
  "Heard",
  "Adjourned",
  "Settled",
  "Won",
  "Lost",
  "Withdrawn",
];

export const ARB_PAYMENT_STATUS_OPTIONS = [
  "Pending",
  "Partial Payment",
  "Full Payment",
  "Denied",
  "Appeal Filed",
  "Collected",
];

export const ticketStatusEnum = pgEnum("ticket_status", ["open", "working_on_it", "done", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);
export const ticketCategoryEnum = pgEnum("ticket_category", ["bug", "feature_request", "ui_change", "question", "other"]);

export const fileUploads = pgTable("file_uploads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tickets = pgTable("tickets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: ticketCategoryEnum("category").notNull().default("other"),
  priority: ticketPriorityEnum("priority").notNull().default("medium"),
  status: ticketStatusEnum("status").notNull().default("open"),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const ticketComments = pgTable("ticket_comments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ticketActivity = pgTable("ticket_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ticketId: integer("ticket_id").notNull().references(() => tickets.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertClinicSchema = createInsertSchema(clinics).omit({ id: true });
export const insertInsuranceSchema = createInsertSchema(insurances).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, inputDate: true });
export const insertTaskActivitySchema = createInsertSchema(taskActivity).omit({ id: true, timestamp: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertDenialSchema = createInsertSchema(denials).omit({ id: true, createdAt: true });
export const insertDenialActivitySchema = createInsertSchema(denialActivity).omit({ id: true, timestamp: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export const insertTicketActivitySchema = createInsertSchema(ticketActivity).omit({ id: true, timestamp: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClinic = z.infer<typeof insertClinicSchema>;
export type Clinic = typeof clinics.$inferSelect;
export type InsertInsurance = z.infer<typeof insertInsuranceSchema>;
export type Insurance = typeof insurances.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTaskActivity = z.infer<typeof insertTaskActivitySchema>;
export type TaskActivity = typeof taskActivity.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertDenial = z.infer<typeof insertDenialSchema>;
export type Denial = typeof denials.$inferSelect;
export type InsertDenialActivity = z.infer<typeof insertDenialActivitySchema>;
export type DenialActivity = typeof denialActivity.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketActivity = z.infer<typeof insertTicketActivitySchema>;
export type TicketActivity = typeof ticketActivity.$inferSelect;

export type TicketActivityWithUser = TicketActivity & {
  user?: User | null;
};

export type TicketWithRelations = Ticket & {
  createdBy?: User | null;
  commentCount?: number;
};

export type TicketCommentWithUser = TicketComment & {
  user?: User | null;
};

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  ui_change: "UI Change",
  question: "Question",
  other: "Other",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  working_on_it: "Working on it",
  done: "Done",
  closed: "Closed",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export type TaskWithRelations = Task & {
  uploader?: User | null;
  clinic?: Clinic | null;
  insurance?: Insurance | null;
  assignedUser?: User | null;
};

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginData = z.infer<typeof loginSchema>;

export const BUCKET_LABELS: Record<string, string> = {
  for_verification: "FOR VERIFICATION",
  ready_for_billing: "READY FOR BILLING",
  done: "DONE",
};

export const STATUS_LABELS: Record<string, string> = {
  working_on_it: "Working on it",
  billed: "Billed",
  done: "Done",
  dropped: "Dropped",
  assigned: "Assigned",
  unassigned: "Unassigned",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  critical: "Critical",
};
