import { storage } from "./storage";
import { db } from "./db";
import { users, insurances, dropdownOptions, dropdownCategoryInitializations, MANAGED_TYPE_DROPDOWN_DEFAULTS,
  DENIAL_TYPE_OPTIONS, FILED_TO_OPTIONS, ARB_STATUS_OPTIONS, ARB_PAYMENT_STATUS_OPTIONS,
  COLLECTION_DIVISION_OPTIONS, COLLECTION_ISSUE_TYPE_OPTIONS, COLLECTION_ACTION_OPTIONS,
  COLLECTION_OUTCOME_OPTIONS, COLLECTION_STATUS_OPTIONS,
} from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { sql, eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

const INSURANCE_NAMES = [
  "21st Century", "Abrams", "Abrams Fensterman", "Adirondak", "Affirmative Direct",
  "American Family", "American Freedom", "American National", "Amico", "AmTrust",
  "Arch", "ATIC", "Biberk", "Black Car Fund", "Bristol West", "Broadspire",
  "Cannon Cochran", "Carolina Casualty Ins", "Cedar Ins", "Chubb",
  "Chubb National Ins", "Corporate Claims Service", "Country-Wide",
  "Crum & Foster Ins", "CURE Ins", "Davies Group", "Empire Fire",
  "Empire Fire Marine Ins", "Employers Assurance", "Erie Ins", "ESB",
  "Esurance", "Farmers Ins", "First Chicago", "Foremost", "Founders Ins",
  "Gallagher Bassett", "GEICO", "Genotee", "Glacier Ins", "Hagerty",
  "Hanover", "Hartford", "Hereford (NF)", "Hereford (WC)", "Hertz",
  "ICW/Amity", "Infinity Auto", "Integon", "Kemper", "Komodo", "Lancer",
  "Liberty Mutual", "Liberty Mutual (WC)", "Maya", "Memic",
  "Mercury Casualty", "MTA-Bus (NF)", "MTA-Bus (WC)", "MVAIC", "NARISK",
  "National General", "Nationwide Mutual", "NJM Ins (NF)", "NJM Ins (WC)",
  "NY Law Dept", "NYCM", "NYCTA", "NYS Workers Comp Board", "NYSIF",
  "Ocean (WC)", "Ocean Harbor", "Old Republic Ins", "Pearl Holding",
  "Pennsylvania", "Plymouth", "Progressive", "Rental Claims", "Rep West",
  "SafeCo", "Sedgwick", "Sedgwick (NF)", "Sedgwick (WC)", "State Farm",
  "Stillwater", "Tesla Ins Services", "The General Ins", "Transit General Ins",
  "Travelers", "Travelers (WC)", "Tristar Risk Mngt", "USAA", "Utica",
  "Voyager", "Zurich",
];

export async function ensureCeoBoxUsers() {
  async function hashPass(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }
  const ceoUsers = [
    { username: "mserrano", fullName: "Maria Serrano", role: "manager" as const },
    { username: "almanjoorsa", fullName: "Dr. Al Manjoorsa", role: "manager" as const },
    { username: "dcruz", fullName: "David Cruz", role: "manager" as const },
  ];

  const allUsers = await storage.getAllUsers();

  for (const u of ceoUsers) {
    const byUsername = allUsers.find(x => x.username === u.username);
    const byName = allUsers.filter(x => x.fullName === u.fullName);

    if (byName.length > 1) {
      const seedAccount = byName.find(x => x.username === u.username);
      if (seedAccount) {
        const keepAccount = byName.find(x => x.username !== u.username);
        if (keepAccount) {
          await db.execute(sql`UPDATE ceo_box SET created_by_id = ${keepAccount.id} WHERE created_by_id = ${seedAccount.id}`);
          await storage.deleteUser(seedAccount.id);
          await storage.updateUser(keepAccount.id, { ceoBoxAccess: true });
          console.log(`Removed duplicate CEO user ${u.fullName} (${seedAccount.username}), granted CEO access to kept id=${keepAccount.id}`);
        }
      }
      continue;
    }

    if (byUsername || byName.length === 1) {
      const existing = byUsername || byName[0];
      if (existing && !existing.ceoBoxAccess) {
        await storage.updateUser(existing.id, { ceoBoxAccess: true });
        console.log(`Granted CEO Box access to existing user: ${existing.fullName}`);
      }
      continue;
    }

    const password = await hashPass("pass123");
    await storage.createUser({ username: u.username, password, fullName: u.fullName, role: u.role, ceoBoxAccess: true });
    console.log(`Created CEO Box user: ${u.fullName} (${u.username})`);
  }
}

export async function seedInsurances() {
  for (const name of INSURANCE_NAMES) {
    await db.insert(insurances).values({ name }).onConflictDoNothing();
  }
  console.log(`Ensured ${INSURANCE_NAMES.length} insurances exist`);
}

export async function seed() {
  await seedInsurances();
  await seedDropdownOptions();
  await ensureCeoBoxUsers();

  const existingUsers = await storage.getAllUsers();
  if (existingUsers.length > 0) return;

  console.log("Seeding database...");

  const adminPass = await hashPassword("admin123");
  const verifierPass = await hashPassword("pass123");
  const billerPass = await hashPassword("pass123");
  const assignerPass = await hashPassword("pass123");

  const admin = await storage.createUser({
    username: "admin",
    password: adminPass,
    fullName: "Sarah Mitchell",
    role: "admin",
  });

  const verifier1 = await storage.createUser({
    username: "jsmith",
    password: verifierPass,
    fullName: "James Smith",
    role: "verifier",
  });

  const verifier2 = await storage.createUser({
    username: "mwilson",
    password: verifierPass,
    fullName: "Maria Wilson",
    role: "verifier",
  });

  const biller1 = await storage.createUser({
    username: "dchen",
    password: billerPass,
    fullName: "David Chen",
    role: "biller",
  });

  const biller2 = await storage.createUser({
    username: "lgarcia",
    password: billerPass,
    fullName: "Lisa Garcia",
    role: "biller",
  });

  const assigner = await storage.createUser({
    username: "tking",
    password: assignerPass,
    fullName: "Tom King",
    role: "assigner",
  });

  const clinic1 = await storage.createClinic({ name: "Downtown Medical" });
  const clinic2 = await storage.createClinic({ name: "Westside Health" });
  const clinic3 = await storage.createClinic({ name: "Central Orthopedics" });
  const clinic4 = await storage.createClinic({ name: "Northpoint Family" });
  const clinic5 = await storage.createClinic({ name: "Lakeside Wellness" });

  const ins1 = await storage.createInsurance({ name: "Blue Cross" });
  const ins2 = await storage.createInsurance({ name: "Aetna" });
  const ins3 = await storage.createInsurance({ name: "United Healthcare" });
  const ins4 = await storage.createInsurance({ name: "Cigna" });
  const ins5 = await storage.createInsurance({ name: "Medicare" });

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const daysFromNow = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const taskData = [
    { patientName: "Johnson, Robert", clinicId: clinic1.id, insuranceId: ins1.id, assignedUserId: verifier1.id, priority: "critical" as const, status: "working_on_it" as const, bucket: "for_verification" as const, dueDate: daysAgo(2), ieDate: daysAgo(10), uploaderId: assigner.id },
    { patientName: "Davis, Emily", clinicId: clinic2.id, insuranceId: ins2.id, assignedUserId: verifier2.id, priority: "medium" as const, status: "assigned" as const, bucket: "for_verification" as const, dueDate: daysFromNow(3), ieDate: daysAgo(5), uploaderId: assigner.id },
    { patientName: "Brown, Michael", clinicId: clinic3.id, insuranceId: ins3.id, assignedUserId: null, priority: "low" as const, status: "unassigned" as const, bucket: "for_verification" as const, dueDate: daysFromNow(7), ieDate: daysAgo(3), uploaderId: admin.id },
    { patientName: "Thompson, Sarah", clinicId: clinic1.id, insuranceId: ins4.id, assignedUserId: verifier1.id, priority: "critical" as const, status: "working_on_it" as const, bucket: "for_verification" as const, dueDate: daysAgo(1), ieDate: daysAgo(8), uploaderId: assigner.id },
    { patientName: "Martinez, Jennifer", clinicId: clinic4.id, insuranceId: ins5.id, assignedUserId: verifier2.id, priority: "medium" as const, status: "assigned" as const, bucket: "for_verification" as const, dueDate: daysFromNow(2), ieDate: daysAgo(4), uploaderId: assigner.id },
    { patientName: "Anderson, William", clinicId: clinic2.id, insuranceId: ins1.id, assignedUserId: biller1.id, priority: "critical" as const, status: "assigned" as const, bucket: "ready_for_billing" as const, dueDate: daysAgo(3), ieDate: daysAgo(15), uploaderId: assigner.id },
    { patientName: "Taylor, Jessica", clinicId: clinic5.id, insuranceId: ins2.id, assignedUserId: biller2.id, priority: "medium" as const, status: "working_on_it" as const, bucket: "ready_for_billing" as const, dueDate: daysFromNow(1), ieDate: daysAgo(7), uploaderId: admin.id },
    { patientName: "White, Daniel", clinicId: clinic3.id, insuranceId: ins3.id, assignedUserId: biller1.id, priority: "low" as const, status: "assigned" as const, bucket: "ready_for_billing" as const, dueDate: daysFromNow(5), ieDate: daysAgo(6), uploaderId: assigner.id },
    { patientName: "Harris, Ashley", clinicId: clinic1.id, insuranceId: ins4.id, assignedUserId: biller2.id, priority: "medium" as const, status: "working_on_it" as const, bucket: "ready_for_billing" as const, dueDate: daysFromNow(2), ieDate: daysAgo(9), uploaderId: assigner.id },
    { patientName: "Lee, Christopher", clinicId: clinic4.id, insuranceId: ins5.id, assignedUserId: biller1.id, priority: "low" as const, status: "billed" as const, bucket: "done" as const, dueDate: daysAgo(1), ieDate: daysAgo(20), uploaderId: admin.id },
    { patientName: "Clark, Amanda", clinicId: clinic2.id, insuranceId: ins1.id, assignedUserId: verifier1.id, priority: "medium" as const, status: "done" as const, bucket: "done" as const, dueDate: daysAgo(2), ieDate: daysAgo(12), uploaderId: assigner.id },
    { patientName: "Rodriguez, Kevin", clinicId: clinic5.id, insuranceId: ins3.id, assignedUserId: biller2.id, priority: "critical" as const, status: "billed" as const, bucket: "done" as const, dueDate: daysAgo(1), ieDate: daysAgo(14), uploaderId: assigner.id },
    { patientName: "Walker, Nicole", clinicId: clinic3.id, insuranceId: ins2.id, assignedUserId: null, priority: "low" as const, status: "unassigned" as const, bucket: "for_verification" as const, dueDate: daysFromNow(10), ieDate: daysAgo(2), uploaderId: admin.id },
    { patientName: "Moore, Brian", clinicId: clinic1.id, insuranceId: ins5.id, assignedUserId: verifier2.id, priority: "critical" as const, status: "working_on_it" as const, bucket: "for_verification" as const, dueDate: daysAgo(4), ieDate: daysAgo(12), uploaderId: assigner.id },
    { patientName: "Hall, Stephanie", clinicId: clinic4.id, insuranceId: ins4.id, assignedUserId: biller1.id, priority: "medium" as const, status: "assigned" as const, bucket: "ready_for_billing" as const, dueDate: daysFromNow(3), ieDate: daysAgo(8), uploaderId: assigner.id },
  ];

  for (const data of taskData) {
    const task = await storage.createTask(data);
    await storage.createTaskActivity({
      taskId: task.id,
      userId: data.uploaderId || admin.id,
      action: "Task created",
      field: null,
      oldValue: null,
      newValue: null,
    });
  }

  await storage.createNotification({
    userId: verifier1.id,
    taskId: 1,
    message: "Task 'Robert Johnson' is overdue! Please complete verification.",
    read: false,
  });

  await storage.createNotification({
    userId: biller1.id,
    taskId: 6,
    message: "Critical task 'William Anderson' is overdue for billing.",
    read: false,
  });

  await storage.createNotification({
    userId: admin.id,
    taskId: 14,
    message: "Task 'Brian Moore' has been escalated - 4 days overdue.",
    read: false,
  });

  console.log("Seed complete! Login with admin/admin123");
}

export async function seedDropdownOptions() {
  const allCategories: Record<string, string[]> = {
    denial_type: DENIAL_TYPE_OPTIONS,
    filed_to: FILED_TO_OPTIONS,
    arb_status: ARB_STATUS_OPTIONS,
    arb_payment_status: ARB_PAYMENT_STATUS_OPTIONS,
    collection_division: COLLECTION_DIVISION_OPTIONS,
    collection_issue_type: COLLECTION_ISSUE_TYPE_OPTIONS,
    collection_action: [
      ...COLLECTION_ACTION_OPTIONS,
      "Send Collection Letter", "Send Final Demand Letter", "Send Balance Reminder",
      "Request Payment Commitment", "Follow Up on Payment Promise", "Escalate to Collection Supervisor",
    ],
    collection_outcome: COLLECTION_OUTCOME_OPTIONS,
    collection_status: COLLECTION_STATUS_OPTIONS,
    verification_action: [
      "Verify Insurance Eligibility", "Verify Claim Number", "Verify Policy Details",
      "Confirm Case is Open and Billable", "Confirm Workers' Compensation Claim", "Confirm Lien Status",
      "Request Missing Insurance Information", "Follow Up with Patient", "Follow Up with Front Desk", "Follow Up with Law Office",
    ],
    billing_action: [
      "Prepare Bill", "Generate Billing Statement", "Send Initial Bill",
      "Send Bill to Insurance", "Send Bill to Attorney", "Send Bill to Employer",
      "Resend Bill", "Correct Billing Information", "Submit Supporting Documents", "Submit Medical Records", "Update Claim Details",
    ],
    posting_action: [],
    denial_action: [
      "Review Denial Reason", "Correct Billing Error", "Submit Appeal",
      "Submit Additional Documents", "Resubmit Claim", "Follow Up on Appeal", "Request Denial Letter",
    ],
    arbitration_action: [
      "Prepare Arbitration Documents", "File Arbitration", "Follow Up Arbitration Status",
      "Await Arbitration Decision", "Process Settlement Payment",
    ],
    checks_action: [],
  };

  const renameMap: Record<string, string> = {
    verification_activity: "verification_action",
    billing_activity: "billing_action",
    posting_activity: "posting_action",
    collections_activity: "collection_action",
    denial_activity: "denial_action",
    arbitration_activity: "arbitration_action",
    checks_activity: "checks_action",
  };

  for (const [oldCat, newCat] of Object.entries(renameMap)) {
    const oldRows = await db.select().from(dropdownOptions).where(eq(dropdownOptions.category, oldCat));
    if (oldRows.length > 0) {
      const existingNewRows = await db.select().from(dropdownOptions).where(eq(dropdownOptions.category, newCat));
      const existingValues = new Set(existingNewRows.map(r => r.value));
      const toMigrate = oldRows.filter(r => !existingValues.has(r.value));
      if (toMigrate.length > 0) {
        await db.insert(dropdownOptions).values(
          toMigrate.map((r, i) => ({ category: newCat, value: r.value, sortOrder: existingNewRows.length + i }))
        );
      }
      await db.delete(dropdownOptions).where(eq(dropdownOptions.category, oldCat));
      console.log(`Migrated ${oldCat} → ${newCat} (${toMigrate.length} new, ${oldRows.length} removed)`);
    }
  }

  const existing = await db.select({ category: dropdownOptions.category }).from(dropdownOptions);
  const existingCategories = new Set(existing.map(e => e.category));

  const rows: { category: string; value: string; sortOrder: number }[] = [];
  for (const [category, values] of Object.entries(allCategories)) {
    if (existingCategories.has(category)) continue;
    values.forEach((value, i) => {
      rows.push({ category, value, sortOrder: i });
    });
  }

  if (rows.length > 0) {
    await db.insert(dropdownOptions).values(rows);
    console.log(`Seeded ${rows.length} dropdown options for new categories`);
  }

  await seedManagedTypeDropdownOptions();
}

export async function seedManagedTypeDropdownOptions() {
  for (const [category, values] of Object.entries(MANAGED_TYPE_DROPDOWN_DEFAULTS)) {
    await db.transaction(async tx => {
      const [initialized] = await tx.insert(dropdownCategoryInitializations).values({ category })
        .onConflictDoNothing().returning();
      if (!initialized) return;
      const existingOptions = await tx.select({ id: dropdownOptions.id }).from(dropdownOptions)
        .where(eq(dropdownOptions.category, category)).limit(1);
      if (existingOptions.length === 0) {
        await tx.insert(dropdownOptions).values(values.map((value, sortOrder) => ({ category, value, sortOrder })));
      }
    });
  }
}
