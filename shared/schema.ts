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

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertClinicSchema = createInsertSchema(clinics).omit({ id: true });
export const insertInsuranceSchema = createInsertSchema(insurances).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, inputDate: true });
export const insertTaskActivitySchema = createInsertSchema(taskActivity).omit({ id: true, timestamp: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });

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
