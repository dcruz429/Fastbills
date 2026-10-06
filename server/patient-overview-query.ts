import { and, desc, eq, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "./db";
import { tasks, clinics, insurances, users, postings, collections, denials, arbitrations, checks } from "../shared/schema";
import { patientSearchTokens } from "../shared/patient-overview";
import type { PatientOverviewData } from "./patient-overview";

export function patientNameCondition(column: PgColumn, query: string) {
  const tokens = patientSearchTokens(query);
  if (!tokens.length) return sql`false`;
  // Tokens contain only letters/digits, so SQL wildcard characters never widen
  // the search. Parameters are bound, not concatenated into the SQL statement.
  return and(...tokens.map(token =>
    sql`lower(regexp_replace(coalesce(${column}, ''), '[^[:alnum:]]+', ' ', 'g')) like ${`%${token}%`}`,
  ));
}

export async function searchPatientRecords(query: string): Promise<PatientOverviewData> {
  // Read-only, name-filtered queries: unlike getAllTasks(), this lookup must not
  // move dropped tasks between buckets or load unrelated patient records.
  const [taskRows, posting, collectionRows, denialRows, arbitration, checkRows] = await Promise.all([
    db.select({
      task: tasks, clinic: clinics.name, insurance: insurances.name, assignedTo: users.fullName,
    }).from(tasks)
      .leftJoin(clinics, eq(tasks.clinicId, clinics.id))
      .leftJoin(insurances, eq(tasks.insuranceId, insurances.id))
      .leftJoin(users, eq(tasks.assignedUserId, users.id))
      .where(patientNameCondition(tasks.patientName, query)).orderBy(desc(tasks.createdAt)),
    db.select().from(postings).where(patientNameCondition(postings.patientName, query)).orderBy(desc(postings.createdAt)),
    db.select().from(collections).where(patientNameCondition(collections.patientName, query)).orderBy(desc(collections.createdAt)),
    db.select().from(denials).where(patientNameCondition(denials.patientName, query)).orderBy(desc(denials.createdAt)),
    db.select().from(arbitrations).where(patientNameCondition(arbitrations.patientName, query)).orderBy(desc(arbitrations.createdAt)),
    db.select().from(checks).where(patientNameCondition(checks.patientName, query)).orderBy(desc(checks.createdAt)),
  ]);
  return { tasks: taskRows, posting, collections: collectionRows, denials: denialRows, arbitration, checks: checkRows };
}
