import { sql } from "drizzle-orm";
import { db } from "./db";
import {
  tasks, taskActivity, denials, denialActivity, arbitrations, arbitrationActivity,
  collections, collectionActivity, postings, postingActivity, checks, checkActivity,
  closed, closedActivity, users,
} from "../shared/schema";
import { buildProductivityTransfers, TRANSFER_DESTINATIONS, type TransferActivity, type ProductivityTransfer } from "../shared/productivity-transfers";

export async function getProductivityTransfers(): Promise<ProductivityTransfer[]> {
  // Outcome transfers move tasks into the Done bucket. Recover the source
  // bucket from its original audit entry at the time of the outcome, rather
  // than incorrectly labelling every finished Verification task as Billing.
  const taskBucketAtTransfer = sql`coalesce((
    SELECT CASE WHEN bucket_history.new_value = 'done'
      THEN bucket_history.old_value ELSE bucket_history.new_value END
    FROM ${taskActivity} AS bucket_history
    WHERE bucket_history.task_id = ${taskActivity.taskId}
      AND lower(bucket_history.field) = 'bucket'
      AND bucket_history.action NOT LIKE '[%'
      AND (bucket_history.timestamp < ${taskActivity.timestamp}
        OR (bucket_history.timestamp = ${taskActivity.timestamp} AND bucket_history.id < ${taskActivity.id}))
    ORDER BY bucket_history.timestamp DESC, bucket_history.id DESC LIMIT 1
  ), ${tasks.bucket}::text)`;
  const taskDepartment = sql`CASE ${taskBucketAtTransfer}
    WHEN 'for_verification' THEN 'Verification'
    WHEN 'ready_for_billing' THEN 'Billing'
    ELSE 'Verification/Billing' END`;
  const sources = [
    { activity: taskActivity, record: tasks, recordId: taskActivity.taskId, department: taskDepartment },
    { activity: denialActivity, record: denials, recordId: denialActivity.denialId, department: "Denials" },
    { activity: arbitrationActivity, record: arbitrations, recordId: arbitrationActivity.arbitrationId, department: "Arbitration" },
    { activity: collectionActivity, record: collections, recordId: collectionActivity.collectionId, department: "Collections" },
    { activity: postingActivity, record: postings, recordId: postingActivity.postingId, department: "Posting" },
    { activity: checkActivity, record: checks, recordId: checkActivity.checkId, department: "Checks" },
    { activity: closedActivity, record: closed, recordId: closedActivity.closedId, department: "RTP" },
  ];
  const outcomes = sql.join(Object.keys(TRANSFER_DESTINATIONS).map(value => sql`${value}`), sql`, `);
  const queries = sources.map(source => sql`
    SELECT ${source.activity.id} AS "id", ${source.recordId} AS "recordId",
      ${source.activity.userId} AS "userId", ${users.fullName} AS "userName",
      ${source.record.patientName} AS "patientName", ${source.activity.action} AS "action",
      ${source.activity.timestamp} AS "timestamp", ${source.department} AS "department",
      ${source.activity.field} AS "field", ${source.activity.oldValue} AS "oldValue",
      ${source.activity.newValue} AS "newValue"
    FROM ${source.activity}
    LEFT JOIN ${source.record} ON ${source.recordId} = ${source.record.id}
    LEFT JOIN ${users} ON ${source.activity.userId} = ${users.id}
    WHERE lower(${source.activity.field}) = 'outcome'
      AND ${source.activity.newValue} IN (${outcomes})
      AND ${source.activity.action} NOT LIKE '[%'
      AND ${source.activity.oldValue} IS DISTINCT FROM ${source.activity.newValue}
  `);
  const result = await db.execute<TransferActivity>(sql`${sql.join(queries, sql` UNION ALL `)} ORDER BY "timestamp" DESC`);
  return buildProductivityTransfers(result.rows);
}
