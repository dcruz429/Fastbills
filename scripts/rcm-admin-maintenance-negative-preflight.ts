/**
 * Negative-only synthetic staging preflight for four administrative maintenance
 * endpoints. Uses an actual non-admin demo account, submits no payload fields,
 * and verifies financial tracker row counts remain unchanged.
 *
 * This proves representative non-admin denial only. It does NOT validate
 * an admin's explicit RCM permission-deny overrides, nor that all writes are safe.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DB = "fastbills_rcm_synthetic_staging";
const BASE = "http://127.0.0.1:5001";
const USERNAME = "rcm_demo_manager";
const TRACKERS = ["denials", "checks", "arbitrations", "collections", "postings", "closed"] as const;
const OPERATIONS = [
  "/api/admin/cleanup-legacy-rtp",
  "/api/admin/recover-notes",
  "/api/admin/backfill-assigned-status",
  "/api/admin/rename-kimberly",
] as const;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error("REFUSED: " + message);
}

async function main() {
  const url = process.env.DATABASE_URL;
  assert(url && decodeURIComponent(new URL(url).pathname) === "/" + DB,
    "exact synthetic staging database required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const identity = await pool.query("SELECT current_database() AS name");
    assert(identity.rows[0]?.name === DB, "unexpected database");
    const demo = await pool.query(
      "SELECT role,active FROM users WHERE username=$1", [USERNAME]);
    assert(demo.rowCount === 1 && demo.rows[0].active === true &&
      demo.rows[0].role === "manager", "expected active non-admin manager fixture missing");
    const counts = async () => {
      const result: Record<string, number> = {};
      for (const table of TRACKERS) {
        const query = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
        result[table] = Number(query.rows[0].n);
      }
      return result;
    };
    const before = await counts();
    const line = readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt", "utf8")
      .split("\n").find(entry => entry.startsWith(USERNAME + " |"));
    assert(line, "synthetic manager login missing");
    const [username, , password] = line.split("|").map(part => part.trim());
    const login = await fetch(BASE + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(12000),
    });
    assert(login.status === 200, "fictional manager login failed");
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert(cookie, "fictional manager session cookie missing");
    console.log("PASS: synthetic database and non-admin manager identity verified");

    let failures = 0;
    for (const operation of OPERATIONS) {
      const response = await fetch(BASE + operation, {
        method: "POST",
        headers: { Cookie: cookie!, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(12000),
      });
      const pass = response.status === 403;
      console.log(`${pass ? "PASS" : "FAIL"}: ${operation} rejected for non-admin (HTTP ${response.status})`);
      if (!pass) {
        failures++;
        // If a destructive handler might have been reached, do not call any
        // further endpoints.
        console.error("STOP: unexpected maintenance endpoint response");
        break;
      }
    }
    const after = await counts();
    if (TRACKERS.some(t => after[t] !== before[t])) {
      failures++;
      console.error("FAIL: financial tracker row counts changed");
    } else console.log("PASS: all financial tracker row counts unchanged");

    if (failures) {
      console.error("RELEASE BLOCKER: administrative maintenance negative preflight failed");
      process.exitCode = 2;
    } else console.log("PASS: four representative non-admin maintenance requests blocked");
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error("Administrative maintenance preflight failed:",
    error instanceof Error ? error.message.split("\n")[0] : "Unexpected error");
  process.exitCode = 1;
});
