import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function seed() {
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
