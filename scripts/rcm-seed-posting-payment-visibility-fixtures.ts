/**
 * Synthetic-only payment document regression fixture installer.
 * Dry run by default. --apply inserts exactly two labeled fictional posting
 * records and grants Posting department scope to the demo biller.
 * No existing posting records are updated or deleted.
 */
import { Pool } from "pg";

const DB = "fastbills_rcm_synthetic_staging";
const USER = "rcm_demo_biller";
const CLINIC = "Evergreen Demo Clinic";
const LABELS = ["TEST SECURITY PAYMENT DOCUMENT", "TEST SECURITY ORDINARY DOCUMENT"] as const;
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error("REFUSED: " + message);
}
async function main() {
  const args = process.argv.slice(2);
  check(args.every(a => a === "--apply") && args.length <= 1, "unexpected arguments");
  const apply = args.includes("--apply");
  const url = process.env.DATABASE_URL;
  check(url && decodeURIComponent(new URL(url).pathname) === "/" + DB,
    "exact synthetic database required");
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const db = await client.query("SELECT current_database() AS name");
    check(db.rows[0]?.name === DB, "database mismatch");
    const users = await client.query(
      "SELECT id,full_name,role,active FROM users WHERE username=$1", [USER]);
    check(users.rowCount === 1 && users.rows[0].active === true && users.rows[0].role === "biller" &&
      typeof users.rows[0].full_name === "string" && users.rows[0].full_name.trim(),
      "expected active fictional biller missing");
    const user = users.rows[0];
    const clinics = await client.query("SELECT id FROM clinics WHERE name=$1", [CLINIC]);
    check(clinics.rowCount === 1, "unique fictional clinic missing");
    const clinicId = Number(clinics.rows[0].id);
    const scopes = await client.query(
      "SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1", [user.id]);
    check(scopes.rows.length === 1 && Number(scopes.rows[0].clinic_id) === clinicId,
      "biller must be scoped only to fictional Evergreen clinic");
    const departments = await client.query(
      "SELECT department_key FROM rcm_user_departments WHERE user_id=$1", [user.id]);
    check(departments.rows.length === 1 && departments.rows[0].department_key === "Billing",
      "expected original Billing-only demo scope");
    const overrides = await client.query(
      "SELECT effect FROM rcm_user_permission_overrides WHERE user_id=$1 AND permission_key='tasks.read'",
      [user.id]);
    check(!overrides.rows.some(row => row.effect === "deny"), "demo biller explicitly denied tasks.read");
    const records = await client.query(
      "SELECT posting_patient_name FROM postings WHERE posting_patient_name=ANY($1::text[])",
      [LABELS]);
    check(records.rowCount === 0, "dedicated synthetic payment fixtures already exist");
    if (!apply) {
      console.log("PASS: exact synthetic database, isolated biller, expected scopes and vacant fixture labels verified");
      console.log("DRY RUN: one synthetic Posting scope and two fictional posting records can be added with --apply");
      await client.query("ROLLBACK");
      return;
    }
    await client.query(
      "INSERT INTO rcm_user_departments (user_id,department_key) VALUES ($1,'Posting')",
      [user.id]);
    await client.query(
      "INSERT INTO postings (posting_patient_name,clinic,document_type,assigned_to,posting_notes) VALUES ($1,$2,$3,$4,$5),($6,$2,$7,$4,$5)",
      [LABELS[0],CLINIC,"Payment",user.full_name,"Fictional payment document security fixture only",
       LABELS[1],"Other"]);
    await client.query("COMMIT");
    console.log("PASS: fictional biller received Posting scope; two fictional Posting records created");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => {
  console.error("Synthetic payment fixture setup failed:",
    error instanceof Error ? error.message.split("\n")[0] : "Unexpected error");
  process.exitCode = 1;
});
