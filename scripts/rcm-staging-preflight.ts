/**
 * Read-only staging startup preflight. Does not launch Express, mutate records,
 * print credentials or inspect patient-level data.
 *
 * DATABASE_URL="$RCM_TEST_URL" RCM_STAGING_SAFE=1 NODE_ENV=production \
 *   npx tsx scripts/rcm-staging-preflight.ts
 */
import pg from "pg";

async function main() {
  const value = process.env.DATABASE_URL;
  if (!value) throw Error("DATABASE_URL missing");
  const u = new URL(value);
  if (decodeURIComponent(u.pathname) !== "/fastbills_rcm_synthetic_staging") {
    throw Error("Expected synthetic staging database only");
  }
  if (process.env.RCM_STAGING_SAFE !== "1") throw Error("RCM_STAGING_SAFE must equal 1");
  if (process.env.NODE_ENV !== "production") throw Error("NODE_ENV must equal production for staging");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === "workflow-secret-key") {
    throw Error("A non-default SESSION_SECRET must be configured in Replit Secrets");
  }
  const client=new pg.Client({connectionString:value});
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const r=await client.query(
      "SELECT current_database() AS db, (SELECT count(*)::integer FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'rcm_%') AS tables",
    );
    if (r.rows[0]?.db !== "fastbills_rcm_synthetic_staging" || r.rows[0]?.tables!==10) {
      throw Error("Staging database identity or schema check failed");
    }
    await client.query("ROLLBACK");
    console.log("PASS: staging connection targets the restored test database");
    console.log("PASS: all 10 RCM migration tables exist");
    console.log("PASS: guarded staging environment variables are configured");
    console.log("NOTE: server not started; no database modifications performed");
  } finally {
    await client.query("ROLLBACK").catch(()=>{});
    await client.end();
  }
}
main().catch(error=>{
  console.error("RCM staging preflight failed:",error instanceof Error?error.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
