import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Backfill: for every tracker record that has status='Done' but no
 * field='status', new_value='Done' activity row, insert one now.
 * Credits the user from the record's earliest activity (the creator).
 * Idempotent — safe to run on every startup.
 */
export async function backfillDoneActivities() {
  const trackers = [
    {
      table: "postings",
      actTable: "posting_activity",
      fk: "posting_id",
      statusCol: "posting_status",
      createdActions: ["Posting created", "Created (CSV import)"],
    },
    {
      table: "checks",
      actTable: "check_activity",
      fk: "check_id",
      statusCol: "check_status",
      createdActions: ["Check created", "Created (CSV import)"],
    },
    {
      table: "closed",
      actTable: "closed_activity",
      fk: "closed_id",
      statusCol: "closed_status",
      createdActions: ["Record created", "Created (CSV import)"],
    },
    {
      table: "collections",
      actTable: "collection_activity",
      fk: "collection_id",
      statusCol: "collection_status",
      createdActions: ["Collection created", "Collection created (CSV import)"],
    },
    {
      table: "denials",
      actTable: "denial_activity",
      fk: "denial_id",
      statusCol: "denial_status",
      createdActions: ["Denial created", "Created (CSV import)"],
    },
    {
      table: "arbitrations",
      actTable: "arbitration_activity",
      fk: "arbitration_id",
      statusCol: "arbitration_status",
      createdActions: ["Arbitration created", "Created (CSV import)"],
    },
  ];

  let totalInserted = 0;

  for (const t of trackers) {
    const placeholders = t.createdActions.map((_, i) => `$${i + 1}`).join(", ");

    // Find records with status=Done that lack a Done activity row,
    // and resolve the crediting user from the earliest activity.
    const rows = await db.execute(sql.raw(`
      SELECT
        rec.id AS record_id,
        COALESCE(
          (SELECT a.user_id FROM ${t.actTable} a
           WHERE a.${t.fk} = rec.id
           ORDER BY a.id ASC LIMIT 1),
          1
        ) AS credit_user_id
      FROM ${t.table} rec
      WHERE rec.${t.statusCol} = 'Done'
        AND NOT EXISTS (
          SELECT 1 FROM ${t.actTable} a2
          WHERE a2.${t.fk} = rec.id
            AND a2.field = 'status'
            AND a2.new_value = 'Done'
        )
    `));

    if (rows.rows.length === 0) continue;

    for (const row of rows.rows) {
      await db.execute(sql.raw(`
        INSERT INTO ${t.actTable} (${t.fk}, user_id, action, field, old_value, new_value, timestamp)
        VALUES (${row.record_id}, ${row.credit_user_id}, 'Status set to Done (backfill)', 'status', NULL, 'Done', NOW())
      `));
      totalInserted++;
    }
  }

  if (totalInserted > 0) {
    console.log(`[backfill] Inserted ${totalInserted} missing Done activity record(s).`);
  }
}

/**
 * Backfill: for every task that has ie_date but no due_date,
 * set due_date = ie_date + 30 days.
 * Idempotent — safe to run on every startup.
 */
export async function backfillDueDates() {
  const result = await db.execute(sql.raw(`
    UPDATE tasks
    SET due_date = ie_date + INTERVAL '30 days'
    WHERE due_date IS NULL AND ie_date IS NOT NULL
  `));
  const count = (result as any).rowCount ?? 0;
  if (count > 0) {
    console.log(`[backfill] Populated due_date for ${count} task(s) using IE + 30 days.`);
  }
}
