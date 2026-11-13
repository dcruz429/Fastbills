/**
 * Transaction-scoped permission integration test on restored staging DB.
 * Changes are always ROLLED BACK. Existing user IDs/credentials are untouched.
 * Never prints patient names, usernames, passwords, connection strings or PHI.
 */
import { pool } from "../server/db";
import { resolveRcmAccess } from "../server/rcm-access-service";
import { permissionAllowed, resourceAllowed } from "../shared/rcm-access-policy";

const EXPECTED_DB = "fastbills_rcm_restore_test";
function ensure(value: unknown, label: string): asserts value {
  if (!value) throw Error("FAIL: " + label);
  console.log("PASS: " + label);
}
async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw || new URL(raw).pathname !== "/" + EXPECTED_DB) {
    throw Error("Refusing to run outside the restored RCM test database");
  }
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const db = await client.query("SELECT current_database() AS db");
    ensure(db.rows[0]?.db === EXPECTED_DB, "correct staging database");
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    // One existing active non-admin account, but never change its stored identity.
    const accounts = await client.query(
      "SELECT id FROM users WHERE active=true AND role::text IN ('biller','manager','account_manager','payment_specialist') ORDER BY id LIMIT 1",
    );
    if (!accounts.rowCount) throw Error("No eligible non-admin account in restored data. No changes performed.");
    const userId = Number(accounts.rows[0].id);
    const clinic = await client.query("SELECT id FROM clinics WHERE id=6");
    ensure(clinic.rowCount === 1, "clinic 6 exists");

    // This test assumes pristine RCM assignments, as verified earlier.
    const current = await client.query(
      "SELECT (SELECT count(*)::integer FROM rcm_user_clinics WHERE user_id=$1) AS clinics, (SELECT count(*)::integer FROM rcm_user_departments WHERE user_id=$1) AS departments, (SELECT count(*)::integer FROM rcm_user_permission_overrides WHERE user_id=$1) AS overrides",
      [userId],
    );
    const existing = current.rows[0];
    ensure(existing.clinics===0 && existing.departments===0 && existing.overrides===0, "selected user's RCM assignments are initially empty");

    let resolved = await resolveRcmAccess(userId, client);
    ensure(!!resolved, "database-backed permission resolver returns an active user");
    const billing={departmentId:"Billing",clinicId:6};
    ensure(!resourceAllowed(resolved!.context,"tasks.read",billing), "unassigned employee cannot read Billing clinic 6");

    await client.query("INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES($1,6)",[userId]);
    await client.query("INSERT INTO rcm_user_departments(user_id,department_key) VALUES($1,'Billing')",[userId]);
    resolved = await resolveRcmAccess(userId, client);
    ensure(!!resolved && resourceAllowed(resolved.context,"tasks.read",billing),"assigned Billing clinic 6 grants task read");
    ensure(!resourceAllowed(resolved!.context,"tasks.read",{departmentId:"Verification",clinicId:6}),"Billing assignment does not grant Verification");
    ensure(!resourceAllowed(resolved!.context,"tasks.read",{departmentId:"Billing",clinicId:999999}),"Billing assignment does not grant other clinics");

    await client.query(
      "INSERT INTO rcm_user_permission_overrides(user_id,permission_key,effect) VALUES($1,'tasks.read','deny')",
      [userId],
    );
    resolved = await resolveRcmAccess(userId, client);
    ensure(!!resolved && !permissionAllowed(resolved.context,"tasks.read"),"individual deny overrides the role grant");
    ensure(!resourceAllowed(resolved!.context,"tasks.read",billing),"individual deny blocks previously authorized Billing clinic 6");
    await client.query("DELETE FROM rcm_user_permission_overrides WHERE user_id=$1 AND permission_key='tasks.read'",[userId]);
    resolved = await resolveRcmAccess(userId, client);
    ensure(!!resolved && resourceAllowed(resolved.context,"tasks.read",billing),"removing deny restores inherited access");

    await client.query("ROLLBACK");
    inTransaction=false;
    const after = await client.query(
      "SELECT (SELECT count(*)::integer FROM rcm_user_clinics WHERE user_id=$1) AS clinics, (SELECT count(*)::integer FROM rcm_user_departments WHERE user_id=$1) AS departments, (SELECT count(*)::integer FROM rcm_user_permission_overrides WHERE user_id=$1) AS overrides",
      [userId],
    );
    ensure(after.rows[0].clinics===0 && after.rows[0].departments===0 && after.rows[0].overrides===0,"ROLLBACK removed all temporary access changes");
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error=>{
  console.error("RCM permission integration test failed:",error instanceof Error ? error.message.split("\n")[0] : "unexpected error");
  process.exitCode=1;
});
