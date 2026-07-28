import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
  ALTER TABLE denials ADD COLUMN IF NOT EXISTS call_calendar_urgency text DEFAULT 'none';
  ALTER TABLE arbitrations ADD COLUMN IF NOT EXISTS call_calendar_urgency text DEFAULT 'none';
  ALTER TABLE collections ADD COLUMN IF NOT EXISTS call_calendar_urgency text DEFAULT 'none';
  ALTER TABLE postings ADD COLUMN IF NOT EXISTS call_calendar_urgency text DEFAULT 'none';
  ALTER TABLE checks ADD COLUMN IF NOT EXISTS call_calendar_urgency text DEFAULT 'none';
`);
console.log("Migration OK");
await pool.end();
