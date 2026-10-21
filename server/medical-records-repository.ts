import { asc, desc, eq, sql } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "./db";
import { medicalRecordContacts, medicalRecordImports, medicalRecordRequests, medicalRecordTabs } from "../shared/schema";
import type { MedicalRecordInput } from "../shared/medical-records";
import { MEDICAL_HISTORY_FILE, MEDICAL_HISTORY_SOURCE, readMedicalWorkbook, reusableMedicalContact } from "./medical-records-import";

export async function ensureMedicalRecordsHistory() {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${MEDICAL_HISTORY_SOURCE}))`);
    const [imported] = await tx.select().from(medicalRecordImports).where(eq(medicalRecordImports.source, MEDICAL_HISTORY_SOURCE));
    if (imported) return imported;
    const path = process.env.NODE_ENV === "production"
      ? resolve("dist/private/medical-records-history.xlsx") : resolve(MEDICAL_HISTORY_FILE);
    const parsed = readMedicalWorkbook(path);
    await tx.insert(medicalRecordTabs).values(parsed.tabs).onConflictDoNothing();
    const tabs = await tx.select().from(medicalRecordTabs);
    const contacts = new Map<string, NonNullable<ReturnType<typeof reusableMedicalContact>>>();
    for (const row of parsed.requests) {
      const contact = reusableMedicalContact(row);
      if (contact) contacts.set(contact.fingerprint, contact);
    }
    const contactRows = Array.from(contacts.values());
    for (let start = 0; start < contactRows.length; start += 100) {
      await tx.insert(medicalRecordContacts).values(contactRows.slice(start, start + 100)).onConflictDoNothing();
    }
    for (let start = 0; start < parsed.requests.length; start += 100) {
      const values = parsed.requests.slice(start, start + 100).map(({ tabName, ...row }) => {
        const tab = tabs.find(tab => tab.name === tabName);
        if (!tab) throw new Error("Imported clinic tab is missing");
        return { ...row, tabId: tab.id };
      });
      await tx.insert(medicalRecordRequests).values(values).onConflictDoNothing({ target: medicalRecordRequests.sourceKey });
    }
    const [summary] = await tx.insert(medicalRecordImports).values({
      source: MEDICAL_HISTORY_SOURCE, requestCount: parsed.requests.length,
    }).returning();
    return summary;
  });
}

export const medicalRecordsRepository = {
  async list() {
    const [tabs, requests, contacts, imports] = await Promise.all([
      db.select().from(medicalRecordTabs).orderBy(asc(medicalRecordTabs.sortOrder), asc(medicalRecordTabs.id)),
      db.select().from(medicalRecordRequests).orderBy(desc(medicalRecordRequests.id)),
      db.select().from(medicalRecordContacts).orderBy(asc(medicalRecordContacts.contactDetails), asc(medicalRecordContacts.contactPerson), asc(medicalRecordContacts.id)),
      db.select().from(medicalRecordImports).where(eq(medicalRecordImports.source, MEDICAL_HISTORY_SOURCE)),
    ]);
    return { tabs, requests, contacts, importSummary: imports[0] ?? null };
  },
  async get(id: number) {
    const [row] = await db.select().from(medicalRecordRequests).where(eq(medicalRecordRequests.id, id));
    return row;
  },
  async getTab(id: number) {
    const [row] = await db.select().from(medicalRecordTabs).where(eq(medicalRecordTabs.id, id));
    return row;
  },
  async save(input: MedicalRecordInput, userId: number, id?: number) {
    return db.transaction(async tx => {
      const [row] = id === undefined
        ? await tx.insert(medicalRecordRequests).values({ ...input, createdById: userId, updatedById: userId }).returning()
        : await tx.update(medicalRecordRequests).set({ ...input, updatedById: userId, updatedAt: new Date() })
          .where(eq(medicalRecordRequests.id, id)).returning();
      if (!row) return undefined;
      const contact = reusableMedicalContact(input);
      if (contact) await tx.insert(medicalRecordContacts).values(contact).onConflictDoNothing();
      return row;
    });
  },
  async delete(id: number) {
    const [row] = await db.delete(medicalRecordRequests).where(eq(medicalRecordRequests.id, id)).returning({ id: medicalRecordRequests.id });
    return !!row;
  },
};

export type MedicalRecordsRepository = typeof medicalRecordsRepository;
