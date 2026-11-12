/**
 * Synthetic-only negative authorization preflight for the four newly guarded
 * legacy financial trackers. Submits only empty/invalid operation payloads.
 * Never submits a real edit, delete, transfer or non-empty CSV import.
 * HTTP 403 proves the request was denied; this does not prove all scopes safe.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DB = "fastbills_rcm_synthetic_staging";
const BASE = "http://127.0.0.1:5001";
const FAMILIES = ["arbitrations", "collections", "postings", "closed"] as const;

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error("REFUSED: " + message);
}

async function main() {
  const url = process.env.DATABASE_URL;
  check(url && decodeURIComponent(new URL(url).pathname) === "/" + DB,
    "exact synthetic-only database URL required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = await pool.query("SELECT current_database() AS name");
    check(db.rows[0]?.name === DB, "wrong database");
    const counts = async () => {
      const out: Record<string, number> = {};
      for (const family of FAMILIES) {
        const result = await pool.query(`SELECT count(*)::int AS count FROM ${family}`);
        out[family] = Number(result.rows[0].count);
      }
      return out;
    };
    const before = await counts();
    const line = readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt", "utf8")
      .split("\n").find(item => item.startsWith("rcm_demo_manager |"));
    check(line, "synthetic manager credentials missing");
    const [username, , password] = line.split("|").map(part => part.trim());
    const login = await fetch(BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(12000),
    });
    check(login.status === 200, "synthetic manager login failed");
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    check(cookie, "synthetic session cookie absent");
    console.log("PASS: synthetic database and manager authentication verified");
    let failures = 0;
    async function attempt(family: string, operation: string, payload: unknown) {
      const response = await fetch(BASE + `/api/${family}/${operation}`, {
        method: "POST",
        headers: { Cookie: cookie!, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      const accepted = response.status === 403;
      console.log(`${accepted ? "PASS" : "FAIL"}: ${family} ${operation} rejected by boundary (HTTP ${response.status})`);
      if (!accepted) failures++;
    }
    for (const family of FAMILIES) {
      await attempt(family, "bulk-update", { ids: [], data: {} });
      await attempt(family, "bulk-delete", { ids: [] });
      await attempt(family, "import-csv", { rows: [] });
    }
    await attempt("closed", "export", {});
    const after = await counts();
    if (FAMILIES.some(family => after[family] !== before[family])) {
      failures++;
      console.error("FAIL: financial row counts changed; STOP testing");
    } else {
      console.log("PASS: synthetic financial row counts unchanged");
    }
    if (failures) {
      console.error("RELEASE BLOCKER: financial legacy mutation boundary failed sampled rejection checks");
      process.exitCode = 2;
    } else {
      console.log("PASS: all 13 representative financial legacy requests were denied");
    }
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error("Financial scope preflight failed:", error instanceof Error ? error.message.split("\n")[0] : "Unexpected error");
  process.exitCode = 1;
});
