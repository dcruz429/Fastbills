/**
 * Synthetic-only, read-only Posting payment visibility regression.
 * Tests an authorized Posting-scoped biller who must see ordinary records
 * but never Payment documents in normal/workload lists or direct URLs.
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const DB = "fastbills_rcm_synthetic_staging";
const BASE = "http://127.0.0.1:5001";
const USER = "rcm_demo_biller";
const PAYMENT = "TEST SECURITY PAYMENT DOCUMENT";
const ORDINARY = "TEST SECURITY ORDINARY DOCUMENT";
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error("REFUSED: " + message);
}
async function main() {
  const url = process.env.DATABASE_URL;
  check(url && decodeURIComponent(new URL(url).pathname) === "/" + DB,
    "exact synthetic database required");
  const pool = new Pool({ connectionString: url, max: 1 });
  let paymentId: number, ordinaryId: number;
  try {
    const db = await pool.query("SELECT current_database() AS name");
    check(db.rows[0]?.name === DB, "wrong database");
    const userRows = await pool.query(
      "SELECT id,full_name,active,role FROM users WHERE username=$1", [USER]);
    check(userRows.rowCount === 1 && userRows.rows[0].role === "biller" &&
      userRows.rows[0].active === true, "active non-payment demo biller missing");
    const user = userRows.rows[0];
    const clinics = await pool.query(
      "SELECT id FROM clinics WHERE name=$1", ["Evergreen Demo Clinic"]);
    check(clinics.rowCount === 1, "unique fictional clinic missing");
    const scopes = await pool.query(
      "SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1", [user.id]);
    check(scopes.rows.length === 1 && Number(scopes.rows[0].clinic_id) === Number(clinics.rows[0].id),
      "demo user is not exclusively scoped to Evergreen clinic");
    const departments = await pool.query(
      "SELECT department_key FROM rcm_user_departments WHERE user_id=$1", [user.id]);
    check(departments.rows.some(row => row.department_key === "Posting"),
      "demo biller needs Posting scope");
    const fixtures = await pool.query(
      "SELECT id,posting_patient_name,clinic,document_type,assigned_to FROM postings WHERE posting_patient_name=ANY($1::text[])",
      [[PAYMENT,ORDINARY]]);
    check(fixtures.rowCount === 2, "exactly two dedicated fictional postings required");
    const payment = fixtures.rows.find(row => row.posting_patient_name === PAYMENT);
    const ordinary = fixtures.rows.find(row => row.posting_patient_name === ORDINARY);
    check(payment && ordinary && payment.clinic === "Evergreen Demo Clinic" &&
      ordinary.clinic === "Evergreen Demo Clinic" &&
      payment.document_type === "Payment" && ordinary.document_type === "Other" &&
      payment.assigned_to === user.full_name && ordinary.assigned_to === user.full_name,
      "fictional posting fields are unexpected");
    paymentId = Number(payment.id); ordinaryId = Number(ordinary.id);
  } finally { await pool.end(); }
  const line = readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt", "utf8")
    .split("\n").find(entry => entry.startsWith(USER + " |"));
  check(line, "fictional biller credentials missing");
  const [username, , password] = line.split("|").map(x => x.trim());
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username,password }),signal:AbortSignal.timeout(12000),
  });
  check(login.status === 200, "fictional biller login failed");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  check(cookie, "fictional session cookie missing");
  console.log("PASS: synthetic fixtures, biller scope and authentication verified");
  let failed=0;
  for(const suffix of ["","?workload=true"]){
    const response=await fetch(BASE+"/api/postings"+suffix,{
      headers:{Cookie:cookie},signal:AbortSignal.timeout(12000),
    });
    let pass=response.status===200;
    if(pass){
      const payload:unknown=await response.json();
      pass=Array.isArray(payload) && payload.some(row=>row?.id===ordinaryId) &&
        !payload.some(row=>row?.id===paymentId);
    }
    console.log((pass?"PASS":"FAIL")+": "+(suffix?"workload":"normal")+
      " list shows ordinary but not payment fixture (HTTP "+response.status+")");
    if(!pass)failed++;
  }
  for(const suffix of ["","/activity"]){
    for(const [label,id,allowed] of [
      ["payment",paymentId,false],["ordinary",ordinaryId,true]
    ] as const){
      const response=await fetch(BASE+"/api/postings/"+id+suffix,{
        headers:{Cookie:cookie},signal:AbortSignal.timeout(12000),
      });
      const pass=allowed?response.status===200:[403,404].includes(response.status);
      console.log((pass?"PASS":"FAIL")+": "+label+(suffix?" activity":" detail")+
        (allowed?" visible":" denied")+" (HTTP "+response.status+")");
      if(!pass)failed++;
    }
  }
  if(failed){
    console.error("RELEASE BLOCKER: "+failed+" Posting payment-document visibility checks failed");
    process.exitCode=2;
  }else console.log("PASS: all 6 Posting payment-document visibility checks");
}
main().catch(error=>{
  console.error("Posting payment visibility test failed:",
    error instanceof Error?error.message.split("\n")[0]:"Unexpected error");
  process.exitCode=1;
});
