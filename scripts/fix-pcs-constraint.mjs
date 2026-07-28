import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// 1. Add unique constraint to prevent duplicate patient+date entries
await pool.query(`
  ALTER TABLE patient_call_schedule
    ADD CONSTRAINT pcs_unique_user_patient_date
    UNIQUE (user_id, source_id, department, scheduled_date);
`).catch(e => {
  if (e.message.includes("already exists")) console.log("Constraint already exists, skipping.");
  else throw e;
});

// 2. Clear the 2 test entries for Jul 28 (before START date, shouldn't be there)
await pool.query(`DELETE FROM patient_call_schedule WHERE scheduled_date < '2026-07-29'`);
const r = await pool.query(`SELECT COUNT(*) c FROM patient_call_schedule`);
console.log("Remaining rows after cleanup:", r.rows[0].c);

await pool.end();
console.log("Done");
