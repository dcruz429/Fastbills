/**
 * Read-only synthetic-only negative preflight for legacy financial read scoping.
 * Fails closed if the fictional cross-clinic test fixtures or scoped identity
 * are missing. No records, attachments or activity histories are modified.
 * Counts/IDs are used for checks only; financial data is never printed.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DB = "fastbills_rcm_synthetic_staging";
const BASE = "http://127.0.0.1:5001";
const OUTSIDE_CLINIC = "Harbor Demo Clinic";
const FAMILIES = [
  { route: "arbitrations", department: "Arbitration", detail: true },
  { route: "collections", department: "Collections", detail: true },
  { route: "postings", department: "Posting", detail: true },
  { route: "closed", department: "RTP", detail: false },
] as const;
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error("REFUSED: " + message);
}
async function main() {
  const url = process.env.DATABASE_URL;
  check(url && decodeURIComponent(new URL(url).pathname) === "/" + DB,
    "exact synthetic staging database required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const name = await pool.query("SELECT current_database() AS name");
    check(name.rows[0]?.name === DB, "wrong database");
    const identity = await pool.query(
      "SELECT id, active FROM users WHERE username=$1", ["rcm_demo_manager"]);
    check(identity.rowCount === 1 && identity.rows[0].active === true,
      "active fictional manager missing");
    const managerId = Number(identity.rows[0].id);
    const clinic = await pool.query(
      "SELECT id FROM clinics WHERE name=$1", [OUTSIDE_CLINIC]);
    check(clinic.rowCount === 1, "unique fictional outside clinic missing");
    const assigned = await pool.query(
      "SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1", [managerId]);
    check(!assigned.rows.some(row => Number(row.clinic_id) === Number(clinic.rows[0].id)),
      "manager has outside-clinic access; negative test would be invalid");
    const targetIds = new Map<string, number>();
    for (const family of FAMILIES) {
      // Tables are fixed in source, never supplied by input.
      const records = await pool.query(
        `SELECT id FROM ${family.route} WHERE clinic=$1 ORDER BY id LIMIT 2`,
        [OUTSIDE_CLINIC]);
      check(records.rowCount! >= 1,
        family.route + " has no fictional outside-clinic record to test");
      targetIds.set(family.route, Number(records.rows[0].id));
    }
    const line = readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt", "utf8")
      .split("\n").find(item => item.startsWith("rcm_demo_manager |"));
    check(line, "synthetic login file lacks manager");
    const [username, , password] = line.split("|").map(part => part.trim());
    const login = await fetch(BASE + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(12000),
    });
    check(login.status === 200, "fictional manager login unsuccessful");
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    check(cookie, "synthetic session cookie missing");
    console.log("PASS: synthetic database, outside-clinic fixtures and scoped manager verified");
    let failed = 0;
    async function request(route: string) {
      const response = await fetch(BASE + route, {
        headers: { Cookie: cookie! },
        signal: AbortSignal.timeout(12000),
      });
      return response;
    }
    for (const family of FAMILIES) {
      const id = targetIds.get(family.route)!;
      for (const query of ["", "?workload=true"]) {
        const route = "/api/" + family.route + query;
        const result = await request(route);
        let pass = result.status === 200;
        if (pass) {
          const data: unknown = await result.json();
          pass = Array.isArray(data) && !data.some(row =>
            row && typeof row === "object" && "id" in row && Number(row.id) === id);
        }
        console.log((pass ? "PASS" : "FAIL") + ": " + family.route +
          (query ? " workload" : " list") + " excludes outside-clinic ID (HTTP " + result.status + ")");
        if (!pass) failed++;
      }
      const activity = await request("/api/" + family.route + "/" + id + "/activity");
      const activityPass = activity.status === 403 || activity.status === 404;
      console.log((activityPass ? "PASS" : "FAIL") + ": " + family.route +
        " outside-clinic activity denied (HTTP " + activity.status + ")");
      if (!activityPass) failed++;
      if (family.detail) {
        const detail = await request("/api/" + family.route + "/" + id);
        const detailPass = detail.status === 403 || detail.status === 404;
        console.log((detailPass ? "PASS" : "FAIL") + ": " + family.route +
          " outside-clinic detail denied (HTTP " + detail.status + ")");
        if (!detailPass) failed++;
      }
    }
    if (failed) {
      console.error("RELEASE BLOCKER: " + failed + " legacy financial read authorization checks failed");
      process.exitCode = 2;
    } else {
      console.log("PASS: all 15 financial read authorization checks denied cross-clinic access");
    }
  } finally {
    await pool.end();
  }
}
main().catch(error => {
  console.error("Financial read preflight failed:",
    error instanceof Error ? error.message.split("\n")[0] : "Unexpected error");
  process.exitCode = 1;
});
