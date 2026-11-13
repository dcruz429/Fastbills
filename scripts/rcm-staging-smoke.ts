/**
 * Read-only PostgreSQL smoke tests for the restored RCM staging database.
 *
 * Run from Replit Shell:
 *   DATABASE_URL="$RCM_TEST_URL" npx tsx scripts/rcm-staging-smoke.ts
 *
 * This script never launches Express, never executes startup seed/backfills,
 * never prints PHI and never writes to the database.
 */
import pg from "pg";
import { UNIFIED_BOARD_QUERY } from "../server/rcm-taskboard-routes";
import { PRODUCTIVITY_COMPLETIONS_QUERY } from "../server/rcm-productivity-routes";
import { RCM_SLA_SUMMARY_QUERY } from "../server/rcm-sla-routes";

const EXPECTED_DB = "fastbills_rcm_restore_test";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing");
  const parsed = new URL(url);
  if (decodeURIComponent(parsed.pathname).slice(1) !== EXPECTED_DB) {
    throw new Error("Refusing to run: connection URL is not the expected restore-test database");
  }
  const client = new pg.Client({ connectionString: url, application_name: "fastbills-rcm-readonly-smoke" });
  await client.connect();
  try {
    const identity = await client.query("SELECT current_database() AS name");
    if (identity.rows[0]?.name !== EXPECTED_DB) throw new Error("Connected to the wrong database");
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    // Explicitly disable any accidental modification during this session.
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const count = await client.query(
      "SELECT count(*)::integer AS n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'rcm_%'",
    );
    if (count.rows[0].n !== 10) throw new Error("Expected exactly 10 RCM tables; found " + count.rows[0].n);

    const board = await client.query(UNIFIED_BOARD_QUERY, [
      false, [] as number[], ["Verification", "Billing", "Posting", "Collections", "Denials", "Arbitration", "Checks", "Closed", "Case Management / RTP"], false, 1, 0,
    ]);
    if (board.rows.length) throw new Error("Zero-clinic board scope unexpectedly returned records");
    console.log("PASS: unified board query executes; zero-clinic access returns 0 rows");

    const sla = await client.query(RCM_SLA_SUMMARY_QUERY, [
      false, [] as number[], ["Verification", "Billing"],
    ]);
    if (sla.rows.some(r => Number(r.openTasks) > 0)) throw new Error("SLA scope leakage");
    console.log("PASS: scoped SLA query executes; zero-clinic access returns 0 open tasks");

    const today = new Date().toISOString().slice(0, 10);
    const productivity = await client.query(PRODUCTIVITY_COMPLETIONS_QUERY, [
      false, [] as number[], ["Verification", "Billing"], today, today,
    ]);
    if (productivity.rows.length) throw new Error("Productivity scope leakage");
    console.log("PASS: productivity query executes; zero-clinic access returns 0 rows");

    const roles = await client.query("SELECT count(*)::integer AS n FROM rcm_roles");
    const weights = await client.query("SELECT count(*)::integer AS n FROM rcm_productivity_weights");
    if (roles.rows[0].n !== 12 || weights.rows[0].n !== 9) {
      throw new Error("Unexpected role/weight seed counts");
    }
    console.log("PASS: 10 RCM tables, 12 seeded roles, 9 productivity weights");
    await client.query("ROLLBACK");
    console.log("PASS: staging smoke checks complete (no writes performed)");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}
main().catch(err => {
  // Database driver errors may contain query parameters or data; suppress details.
  console.error("RCM smoke test failed:", err instanceof Error ? err.message.split("\n")[0] : "unexpected error");
  process.exitCode = 1;
});
