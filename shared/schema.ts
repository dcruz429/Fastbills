import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "verifier", "biller", "assigner", "manager", "payment_specialist", "account_manager", "case_manager"]);
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
  ceoBoxAccess: boolean("ceo_box_access").notNull().default(false),
  guidelineModuleAccess: boolean("guideline_module_access").notNull().default(false),
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
  doa: timestamp("doa"),
  rtp: boolean("rtp").notNull().default(false),
  resolutionDate: timestamp("resolution_date"),
  outcome: text("task_outcome"),
  activity: text("task_activity"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
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
}, (t) => [
  index("task_activity_task_id_idx").on(t.taskId),
]);

export const notifications = pgTable("notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  taskId: integer("task_id").references(() => tasks.id),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
]);

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
  paid: boolean("paid").notNull().default(false),
  comments: text("comments"),
  filedTo: text("filed_to"),
  arbStatus: text("arb_status"),
  trialDate: timestamp("trial_date"),
  arbPaymentStatus: text("arb_payment_status"),
  amountReceived: text("amount_received"),
  checkedBy: text("checked_by"),
  comment: text("comment"),
  action: text("action"),
  outcome: text("outcome"),
  assignedTo: text("assigned_to"),
  status: text("denial_status"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const DENIAL_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];

export const denialActivity = pgTable("denial_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  denialId: integer("denial_id").notNull().references(() => denials.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("denial_activity_denial_id_idx").on(t.denialId),
]);

export const DENIAL_TYPE_OPTIONS = [
  "120 days",
  "30 days",
  "45 days",
  "All Claims Denied",
  "Benefits Exhausted",
  "Claim controverted",
  "Eligible for WC",
  "EUO Patient NC",
  "EUO Provider NC",
  "Failed to comply local licensing requirements (Allstate case)",
  "IME Denied",
  "IME Denied - ACU",
  "IME Denied - CHIRO",
  "IME Denied - CHIRO/ACU",
  "IME Denied - ORTHO",
  "IME Denied - PM",
  "IME Denied - PM&R",
  "IME Non Compliant",
  "IME Report",
  "Incorrect claim format",
  "Lack of Coverage",
  "Legible Bill",
  "Misrepresentation",
  "Motorcycle",
  "No Coverage",
  "No Pre-Auth",
  "Non-cooperation",
  "Non-established body site",
  "Not accordance with ground rules limitation",
  "Not casually related to the compensable injury",
  "Ongoing investigation",
  "Pending Coverage",
  "Pending EUO Patient",
  "Pending EUO Patient & Provider",
  "Pending EUO Provider",
  "Pending IME",
  "Pending Investigation",
  "Policy Canceled",
  "Requesting Additional Docs",
  "Service is prior to DOA",
  "The time limit for filing has expired",
  "Treatment outside NYS Exceeds community standard",
  "Treatment procedure was disallowed",
  "Untimely billed",
  "Variance",
  "Waived claim",
  "Wrong claim number",
  "Wrong insurance",
];

export const FILED_TO_OPTIONS = [
  "Moroff",
  "AAA",
  "Court",
  "Internal",
];

export const ARB_STATUS_OPTIONS = [
  "Allstate case",
  "AR-1 Printed",
  "Arb Hearing Schedule",
  "Atty Revewing Summons",
  "Awarded",
  "Case dismissed",
  "Case Filed",
  "Closed",
  "Dismissed without Prejudice",
  "Do not file",
  "EUO Prov NC; Can't be filed",
  "LIEN",
  "Litigation",
  "Lost",
  "Low balance",
  "New case",
  "Not in CAS",
  "Notice of Trial Filed",
  "Notice of Trial Printed",
  "On Hold",
  "Out For Service W Zellner Wood",
  "Paid - Awarded",
  "Paid - Settlement",
  "Policy Exhausted",
  "Sent to AAA",
  "Served on Def",
  "Settled",
  "Suit",
  "Summons Printed",
  "TBD by ED",
  "Trial date set",
  "Urgent Progressive EUO",
  "Waiting - Resolve 1st case",
  "Withdrawn with Prejudice",
];

export const ARB_PAYMENT_STATUS_OPTIONS = [
  "Pending",
  "Partial Payment",
  "Full Payment",
  "Denied",
  "Appeal Filed",
  "Collected",
];

export const arbitrations = pgTable("arbitrations", {
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
  paid: boolean("paid").notNull().default(false),
  comments: text("comments"),
  filedTo: text("filed_to"),
  filedDate: timestamp("filed_date"),
  arbStatus: text("arb_status"),
  trialDate: timestamp("trial_date"),
  arbPaymentStatus: text("arb_payment_status"),
  amountReceived: text("amount_received"),
  checkedBy: text("checked_by"),
  comment: text("comment"),
  assignedTo: text("assigned_to"),
  status: text("arbitration_status"),
  outcome: text("arbitration_outcome"),
  activity: text("arbitration_activity"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const ARBITRATION_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];

export const arbitrationActivity = pgTable("arbitration_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  arbitrationId: integer("arbitration_id").notNull().references(() => arbitrations.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("arbitration_activity_arbitration_id_idx").on(t.arbitrationId),
]);

export const collections = pgTable("collections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  patientName: text("patient_name").notNull(),
  inputDate: timestamp("input_date"),
  clinic: text("clinic"),
  division: text("division"),
  insurance: text("insurance"),
  dosFrom: timestamp("dos_from"),
  dosTo: timestamp("dos_to"),
  numberOfVisits: integer("number_of_visits"),
  amount: text("amount"),
  paid: boolean("paid").notNull().default(false),
  issueType: text("issue_type"),
  typeOfDenial: text("type_of_denial"),
  action: text("action"),
  outcome: text("outcome"),
  priority: text("priority"),
  assignedTo: text("assigned_to"),
  status: text("collection_status"),
  notes: text("notes"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const collectionActivity = pgTable("collection_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  collectionId: integer("collection_id").notNull().references(() => collections.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("collection_activity_collection_id_idx").on(t.collectionId),
]);

export const COLLECTION_DIVISION_OPTIONS = ["Denied", "Lien", "NF", "WC"];
export const COLLECTION_ISSUE_TYPE_OPTIONS = [
  "Denied", "Dropped", "LIEN", "No History of Payment", "No Payment. No Denial Letter", "WC",
];
export const COLLECTION_ACTION_OPTIONS = [
  "Awaiting Payment", "Data Recorded", "Follow-Up", "Rebilling", "Sent for Arbitration",
  "Sent to Account Specialist", "Write-Off",
];
export const COLLECTION_OUTCOME_OPTIONS = ["For Arbitration", "Loss", "Paid", "Pending", "RTP"];
export const COLLECTION_PRIORITY_OPTIONS = ["Low <10 days", "Medium <20 Days", "High <30 Days", "Critical >30 Days"];
export const COLLECTION_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];

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

export const announcements = pgTable("announcements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
  targetType: text("target_type").notNull(),
  targetRoles: text("target_roles").array(),
  targetUserIds: integer("target_user_ids").array(),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const guidelineModules = pgTable("guideline_modules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  moduleType: text("module_type").notNull().default("guideline"),
  attachments: text("attachments").array(),
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const guidelineModuleContentSchema = z.object({
  title: z.string().trim().min(1, "Module title is required").max(200),
  body: z.string().trim().min(1, "Module content is required").max(100_000),
  moduleType: z.string().trim().min(1, "Module type is required").max(200),
});
export type GuidelineModule = typeof guidelineModules.$inferSelect;
export type InsertGuidelineModule = typeof guidelineModules.$inferInsert;
export type GuidelineModuleWithRelations = GuidelineModule & {
  authorName: string | null;
  updatedByName: string | null;
};

export const medicalRecordTabs = pgTable("medical_record_tabs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const medicalRecordContacts = pgTable("medical_record_contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fingerprint: text("fingerprint").notNull().unique(),
  contactPerson: text("contact_person").notNull().default(""),
  contactDetails: text("contact_details").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  email: text("email").notNull().default(""),
  faxNumber: text("fax_number").notNull().default(""),
});

export const medicalRecordRequests = pgTable("medical_record_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tabId: integer("tab_id").notNull().references(() => medicalRecordTabs.id),
  todayDate: text("today_date").notNull().default(""),
  intake: text("intake").notNull().default(""),
  patientName: text("patient_name").notNull().default(""),
  clinicLocation: text("clinic_location").notNull().default(""),
  requestReceived: text("request_received").notNull().default(""),
  requestSent: text("request_sent").notNull().default(""),
  contactPerson: text("contact_person").notNull().default(""),
  contactDetails: text("contact_details").notNull().default(""),
  contactNumber: text("contact_number").notNull().default(""),
  sentThru: text("sent_thru").notNull().default(""),
  sentBy: text("sent_by").notNull().default(""),
  notes: text("notes").notNull().default(""),
  invoice: text("invoice").notNull().default(""),
  payment: text("payment").notNull().default(""),
  email: text("email").notNull().default(""),
  faxNumber: text("fax_number").notNull().default(""),
  status: text("status").notNull().default("pending"),
  sourceKey: text("source_key").unique(),
  sourceSheet: text("source_sheet"),
  sourceRow: integer("source_row"),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: "set null" }),
  updatedById: integer("updated_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("medical_record_requests_tab_id_idx").on(t.tabId),
]);

export const medicalRecordImports = pgTable("medical_record_imports", {
  source: text("source").primaryKey(),
  requestCount: integer("request_count").notNull(),
  importedAt: timestamp("imported_at").notNull().defaultNow(),
});

export type MedicalRecordTab = typeof medicalRecordTabs.$inferSelect;
export type MedicalRecordContact = typeof medicalRecordContacts.$inferSelect;
export type MedicalRecordRequest = typeof medicalRecordRequests.$inferSelect;

export const announcementAcks = pgTable("announcement_acks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  announcementId: integer("announcement_id").notNull().references(() => announcements.id),
  userId: integer("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at").notNull().defaultNow(),
});

export const directMessages = pgTable("direct_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  recipientId: integer("recipient_id").notNull().references(() => users.id),
  content: text("content").notNull().default(""),
  attachments: text("attachments").array(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("direct_messages_recipient_id_idx").on(t.recipientId),
  index("direct_messages_sender_id_idx").on(t.senderId),
]);

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({ id: true, createdAt: true, readAt: true });

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = Omit<typeof announcements.$inferInsert, "id" | "createdAt">;
export type AnnouncementAck = typeof announcementAcks.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type InsertDirectMessage = Omit<typeof directMessages.$inferInsert, "id" | "createdAt" | "readAt">;

export type AnnouncementWithRelations = Announcement & {
  author?: User | null;
  acks?: (AnnouncementAck & { user?: User | null })[];
  totalRecipients?: number;
  readCount?: number;
};

export type DirectMessageWithUser = DirectMessage & {
  sender?: User | null;
  recipient?: User | null;
};

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertClinicSchema = createInsertSchema(clinics).omit({ id: true });
export const insertInsuranceSchema = createInsertSchema(insurances).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, inputDate: true });
export const insertTaskActivitySchema = createInsertSchema(taskActivity).omit({ id: true, timestamp: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertDenialSchema = createInsertSchema(denials).omit({ id: true, createdAt: true });
export const insertDenialActivitySchema = createInsertSchema(denialActivity).omit({ id: true, timestamp: true });
export const insertArbitrationSchema = createInsertSchema(arbitrations).omit({ id: true, createdAt: true });
export const insertArbitrationActivitySchema = createInsertSchema(arbitrationActivity).omit({ id: true, timestamp: true });
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true, createdAt: true });
export const insertCollectionActivitySchema = createInsertSchema(collectionActivity).omit({ id: true, timestamp: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true, completedAt: true });
export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export const insertTicketActivitySchema = createInsertSchema(ticketActivity).omit({ id: true, timestamp: true });

export type InsertUser = Omit<typeof users.$inferInsert, "id">;
export type User = typeof users.$inferSelect;
export type InsertClinic = Omit<typeof clinics.$inferInsert, "id">;
export type Clinic = typeof clinics.$inferSelect;
export type InsertInsurance = Omit<typeof insurances.$inferInsert, "id">;
export type Insurance = typeof insurances.$inferSelect;
export type InsertTask = Omit<typeof tasks.$inferInsert, "id" | "createdAt" | "inputDate">;
export type Task = typeof tasks.$inferSelect;
export type InsertTaskActivity = Omit<typeof taskActivity.$inferInsert, "id" | "timestamp">;
export type TaskActivity = typeof taskActivity.$inferSelect;
export type InsertNotification = Omit<typeof notifications.$inferInsert, "id" | "createdAt">;
export type Notification = typeof notifications.$inferSelect;
export type InsertDenial = Omit<typeof denials.$inferInsert, "id" | "createdAt">;
export type Denial = typeof denials.$inferSelect;
export type InsertDenialActivity = Omit<typeof denialActivity.$inferInsert, "id" | "timestamp">;
export type DenialActivity = typeof denialActivity.$inferSelect;
export type InsertArbitration = Omit<typeof arbitrations.$inferInsert, "id" | "createdAt">;
export type Arbitration = typeof arbitrations.$inferSelect;
export type InsertArbitrationActivity = Omit<typeof arbitrationActivity.$inferInsert, "id" | "timestamp">;
export type ArbitrationActivity = typeof arbitrationActivity.$inferSelect;
export type InsertCollection = Omit<typeof collections.$inferInsert, "id" | "createdAt">;
export type Collection = typeof collections.$inferSelect;
export type InsertCollectionActivity = Omit<typeof collectionActivity.$inferInsert, "id" | "timestamp">;
export type CollectionActivity = typeof collectionActivity.$inferSelect;
export type InsertTicket = Omit<typeof tickets.$inferInsert, "id" | "createdAt" | "updatedAt" | "completedAt">;
export type Ticket = typeof tickets.$inferSelect;
export type InsertTicketComment = Omit<typeof ticketComments.$inferInsert, "id" | "createdAt">;
export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketActivity = Omit<typeof ticketActivity.$inferInsert, "id" | "timestamp">;
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

export const dropdownOptions = pgTable("dropdown_options", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  category: text("category").notNull(),
  value: text("value").notNull(),
  sortOrder: integer("sort_order").default(0),
});

// Remember initialization even when admins intentionally remove every option.
export const dropdownCategoryInitializations = pgTable("dropdown_category_initializations", {
  category: text("category").primaryKey(),
  initializedAt: timestamp("initialized_at").notNull().defaultNow(),
});

export const insertDropdownOptionSchema = createInsertSchema(dropdownOptions).omit({ id: true });
export type DropdownOption = typeof dropdownOptions.$inferSelect;
export type InsertDropdownOption = Omit<typeof dropdownOptions.$inferInsert, "id">;

export const POSTING_DOCUMENT_TYPES = ["Payment", "Denials", "NP Forms", "MD Rx", "Med Records"];
export const POSTING_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];
export const POSTING_PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];

export const postings = pgTable("postings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fileNumber: text("file_number"),
  clinic: text("clinic"),
  scannedDate: timestamp("scanned_date"),
  documentType: text("document_type"),
  postedDate: timestamp("posted_date"),
  priority: text("priority"),
  assignedTo: text("assigned_to"),
  status: text("posting_status"),
  amount: text("amount"),
  paid: boolean("paid").notNull().default(false),
  outcome: text("posting_outcome"),
  activity: text("posting_activity"),
  patientName: text("posting_patient_name"),
  insurance: text("posting_insurance"),
  depositDate: timestamp("deposit_date"),
  depositedBy: text("deposited_by"),
  notes: text("posting_notes"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const postingActivity = pgTable("posting_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  postingId: integer("posting_id").notNull().references(() => postings.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("posting_activity_posting_id_idx").on(t.postingId),
]);

export const insertPostingSchema = createInsertSchema(postings).omit({ id: true, createdAt: true });
export const insertPostingActivitySchema = createInsertSchema(postingActivity).omit({ id: true, timestamp: true });
export type InsertPosting = Omit<typeof postings.$inferInsert, "id" | "createdAt">;
export type Posting = typeof postings.$inferSelect;
export type InsertPostingActivity = Omit<typeof postingActivity.$inferInsert, "id" | "timestamp">;
export type PostingActivity = typeof postingActivity.$inferSelect;

export const CHECKS_TYPE_OPTIONS = ["Regular Check", "EFT", "Lien", "Arbitration", "Rent", "Medical Records"];
export const CHECKS_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];

export const checks = pgTable("checks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  assignedTo: text("assigned_to"),
  clinic: text("clinic"),
  checkNumber: text("check_number"),
  amount: text("amount"),
  checkDate: timestamp("check_date"),
  inputDate: timestamp("input_date").defaultNow(),
  insurance: text("insurance"),
  fileName: text("file_name"),
  scannedDate: timestamp("scanned_date"),
  type: text("check_type"),
  status: text("check_status"),
  postedDate: timestamp("posted_date"),
  depositDate: timestamp("deposit_date"),
  depositedBy: text("deposited_by"),
  notes: text("notes"),
  outcome: text("check_outcome"),
  activity: text("check_activity"),
  patientName: text("check_patient_name"),
  callCalendarUrgency: text("call_calendar_urgency").default("none"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checkActivity = pgTable("check_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  checkId: integer("check_id").notNull().references(() => checks.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("check_activity_check_id_idx").on(t.checkId),
]);

export const insertCheckSchema = createInsertSchema(checks).omit({ id: true, createdAt: true });
export const insertCheckActivitySchema = createInsertSchema(checkActivity).omit({ id: true, timestamp: true });
export type InsertCheck = Omit<typeof checks.$inferInsert, "id" | "createdAt">;
export type Check = typeof checks.$inferSelect;
export type InsertCheckActivity = Omit<typeof checkActivity.$inferInsert, "id" | "timestamp">;
export type CheckActivity = typeof checkActivity.$inferSelect;

export const OUTCOME_OPTIONS = [
  "Send to Verification",
  "Send to Billing",
  "Send to Posting",
  "Send to Collections",
  "Send to Denials",
  "Send to Arbitration",
  "Send to RTP",
  "Paid",
  "Loss",
  "Billed",
  "Done",
];

export const closed = pgTable("closed", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  patientName: text("patient_name").notNull(),
  clinic: text("clinic"),
  insurance: text("insurance"),
  dosFrom: text("dos_from"),
  dosTo: text("dos_to"),
  numberOfVisits: integer("number_of_visits"),
  amount: text("amount"),
  assignedTo: text("assigned_to"),
  action: text("action"),
  status: text("closed_status"),
  outcome: text("closed_outcome"),
  priority: text("priority"),
  source: text("source"),
  sourceId: integer("source_id"),
  notes: text("notes"),
  recordData: text("record_data"),
  dateExported: timestamp("date_exported"),
  reason: text("reason"),
  regularVisit: integer("regular_visit"),
  fullVisit: integer("full_visit"),
  reportedDate: text("reported_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const closedActivity = pgTable("closed_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  closedId: integer("closed_id").notNull().references(() => closed.id),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (t) => [
  index("closed_activity_closed_id_idx").on(t.closedId),
]);

export const insertClosedSchema = createInsertSchema(closed).omit({ id: true, createdAt: true });
export const insertClosedActivitySchema = createInsertSchema(closedActivity).omit({ id: true, timestamp: true });
export type InsertClosed = Omit<typeof closed.$inferInsert, "id" | "createdAt">;
export type Closed = typeof closed.$inferSelect;
export type InsertClosedActivity = Omit<typeof closedActivity.$inferInsert, "id" | "timestamp">;
export type ClosedActivity = typeof closedActivity.$inferSelect;

export const CLOSED_STATUS_OPTIONS = ["Unassigned", "Assigned", "Working on it", "Done"];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  verifier: "Verifier",
  biller: "Biller",
  assigner: "Case Coordinator",
  manager: "Manager",
  payment_specialist: "Payment Specialist",
  account_manager: "Account Manager",
  case_manager: "Case Manager",
};

export const ceoBox = pgTable("ceo_box", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  work: text("work"),
  dateOfLetter: timestamp("date_of_letter"),
  sender: text("sender"),
  company: text("company"),
  clinic: text("clinic"),
  action: text("action"),
  status: text("status").notNull().default("todo"),
  dueDate: timestamp("due_date"),
  priority: text("priority").notNull().default("medium"),
  attachments: text("attachments").array(),
  notes: text("notes"),
  confidential: boolean("confidential").notNull().default(false),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCeoBoxSchema = createInsertSchema(ceoBox).omit({ id: true, createdAt: true, updatedAt: true, createdById: true });
export type InsertCeoBox = Omit<typeof ceoBox.$inferInsert, "id" | "createdAt" | "updatedAt" | "createdById">;
export type CeoBox = typeof ceoBox.$inferSelect;

export const CEO_USERS = ["Maria Serrano", "Dr. Al Manjoorsa", "David Cruz"] as const;
export const DR_AL_NAME = "Dr. Al Manjoorsa";

export const CEO_STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  working: "Working",
  done: "Done",
  closed: "Closed",
};

export const CEO_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const CALL_STATUS_OPTIONS = [
  "Scheduled", "In Progress", "Attempted", "Follow-Up Required",
  "Rescheduled", "Resolved", "Completed", "Cancelled", "Missed", "Overdue",
];

export const CALL_OUTCOME_OPTIONS = [
  "Spoke With Patient", "Spoke With Authorized Contact", "Resolved",
  "Left Voicemail", "No Answer", "Busy", "Disconnected Number", "Wrong Number",
  "Patient Requested Callback", "Insurance Follow-Up Required",
  "Clinic Follow-Up Required", "Documentation Requested", "Documentation Received",
  "Unable to Verify Identity", "Language Assistance Needed",
  "Escalated to Supervisor", "Other",
];

export const CALL_FOLLOWUP_OUTCOMES = [
  "Left Voicemail", "No Answer", "Busy", "Patient Requested Callback",
  "Insurance Follow-Up Required", "Clinic Follow-Up Required",
  "Documentation Requested", "Language Assistance Needed",
];

export const CALL_DEPARTMENTS = [
  "Verification", "Billing", "Posting", "Collections",
  "Denials", "Arbitration", "RTP", "Checks", "Other",
];

export const scheduledCalls = pgTable("scheduled_calls", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  patientName: text("patient_name").notNull(),
  relatedTaskId: integer("related_task_id").references(() => tasks.id),
  department: text("department"),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  scheduledAt: timestamp("scheduled_at").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  callReason: text("call_reason").notNull(),
  priority: text("priority").notNull().default("medium"),
  callStatus: text("call_status").notNull().default("Scheduled"),
  phoneNumber: text("phone_number"),
  notes: text("notes"),
  parentCallId: integer("parent_call_id"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  clinic: text("clinic"),
  insurance: text("insurance"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("scheduled_calls_scheduled_at_idx").on(t.scheduledAt),
  index("scheduled_calls_assigned_user_id_idx").on(t.assignedUserId),
  index("scheduled_calls_call_status_idx").on(t.callStatus),
  index("scheduled_calls_related_task_id_idx").on(t.relatedTaskId),
]);

export const callAttempts = pgTable("call_attempts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduledCallId: integer("scheduled_call_id").notNull().references(() => scheduledCalls.id),
  attemptedByUserId: integer("attempted_by_user_id").references(() => users.id),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  outcome: text("outcome").notNull(),
  contactPerson: text("contact_person"),
  notes: text("notes"),
  followUpRequired: boolean("follow_up_required").notNull().default(false),
  nextScheduledCallId: integer("next_scheduled_call_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("call_attempts_scheduled_call_id_idx").on(t.scheduledCallId),
]);

export const callActivity = pgTable("call_activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduledCallId: integer("scheduled_call_id").notNull().references(() => scheduledCalls.id),
  callAttemptId: integer("call_attempt_id"),
  actorUserId: integer("actor_user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("call_activity_scheduled_call_id_idx").on(t.scheduledCallId),
]);

// ── Patient Call Schedule (materialized daily snapshots + rollover tracking) ──
export const patientCallSchedule = pgTable("patient_call_schedule", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  sourceId: integer("source_id").notNull(),
  department: text("department").notNull(),
  patientName: text("patient_name"),
  clinic: text("clinic"),
  insurance: text("insurance"),
  scheduledDate: text("scheduled_date").notNull(), // 'YYYY-MM-DD'
  originalDate: text("original_date"),             // null = originally scheduled here; set = rolled from this date
  dailyStatus: text("daily_status"),               // call-day outcome: Done|Resolved|Voicemail|Wrong #|Call Back|Unable|null
  notes: text("notes"),                            // agent attempt notes for this day
  callId: integer("call_id"),                      // linked scheduled_call — auto-created on first open
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("pcs_user_date_idx").on(t.userId, t.scheduledDate),
  index("pcs_user_source_dept_idx").on(t.userId, t.sourceId, t.department),
  uniqueIndex("pcs_unique_user_patient_date").on(t.userId, t.sourceId, t.department, t.scheduledDate),
]);

export const patientCallAudit = pgTable("patient_call_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  sourceId: integer("source_id").notNull(),
  department: text("department").notNull(),
  patientName: text("patient_name"),
  action: text("action").notNull(), // 'auto_rollover'
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  occurredAt: timestamp("occurred_at").defaultNow(),
});

export type PatientCallSchedule = typeof patientCallSchedule.$inferSelect;
export type PatientCallAudit = typeof patientCallAudit.$inferSelect;

export const insertScheduledCallSchema = createInsertSchema(scheduledCalls).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallAttemptSchema = createInsertSchema(callAttempts).omit({ id: true, createdAt: true });
export const insertCallActivitySchema = createInsertSchema(callActivity).omit({ id: true, createdAt: true });

export type ScheduledCall = typeof scheduledCalls.$inferSelect;
export type InsertScheduledCall = Omit<typeof scheduledCalls.$inferInsert, "id" | "createdAt" | "updatedAt">;
export type CallAttempt = typeof callAttempts.$inferSelect;
export type InsertCallAttempt = Omit<typeof callAttempts.$inferInsert, "id" | "createdAt">;
export type CallActivityRecord = typeof callActivity.$inferSelect;
export type InsertCallActivity = Omit<typeof callActivity.$inferInsert, "id" | "createdAt">;

export const teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
});

export const userTeams = pgTable("user_teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull().references(() => teams.id),
  userId: integer("user_id").notNull().references(() => users.id),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });
export const insertUserTeamSchema = createInsertSchema(userTeams).omit({ id: true });

export type Team = typeof teams.$inferSelect;
export type InsertTeam = Omit<typeof teams.$inferInsert, "id">;
export type UserTeam = typeof userTeams.$inferSelect;
export type InsertUserTeam = Omit<typeof userTeams.$inferInsert, "id">;
export type TeamWithMembers = Team & { members: Pick<User, "id" | "fullName" | "role">[] };

export const DROPDOWN_CATEGORIES = [
  { key: "denial_type", label: "Type of Denial" },
  { key: "filed_to", label: "Filed To" },
  { key: "arb_status", label: "ARB Status" },
  { key: "arb_payment_status", label: "ARB Payment Status" },
  { key: "collection_division", label: "Collection Division" },
  { key: "collection_issue_type", label: "Collection Issue Type" },
  { key: "denial_outcome", label: "Denial Outcome" },
  { key: "collection_outcome", label: "Collection Outcome" },
  { key: "collection_status", label: "Collection Status" },
  { key: "verification_action", label: "Verification Action" },
  { key: "billing_action", label: "Billing Action" },
  { key: "posting_action", label: "Posting Action" },
  { key: "posting_document_type", label: "Posting Document Types" },
  { key: "guideline_module_type", label: "Guidelines Board Module Types" },
  { key: "collection_action", label: "Collection Action" },
  { key: "denial_action", label: "Denial Action" },
  { key: "arbitration_action", label: "Arbitration Action" },
  { key: "checks_action", label: "Checks Action" },
  { key: "ceo_sender", label: "CEO Box Sender" },
  { key: "ceo_company", label: "CEO Box Company" },
  { key: "ceo_action", label: "CEO Box Action" },
  { key: "rtp_reason", label: "RTP Reason" },
] as const;

export const MANAGED_TYPE_DROPDOWN_DEFAULTS: Record<string, string[]> = {
  posting_document_type: POSTING_DOCUMENT_TYPES,
  guideline_module_type: ["guideline", "training"],
};
