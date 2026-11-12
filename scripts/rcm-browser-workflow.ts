/**
 * End-to-end Playwright smoke for high-risk assignment approval and QA.
 * Uses ONLY synthetic staging, creates two disposable fictional task records,
 * exercises real browser login/UI/HTTP writes, then removes the fixtures.
 *
 * Run with DATABASE_URL="$RCM_SYNTHETIC_URL" inside the Chromium Nix shell.
 * Does not modify the eight baseline demo tasks or any production data.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const DB_NAME="fastbills_rcm_synthetic_staging";
const BASE="http://127.0.0.1:5001";
const credFile="/tmp/fastbills_rcm_synthetic_logins.txt";
function check(value:unknown,label:string):asserts value {
  if(!value)throw new Error("FAIL: "+label);
  console.log("PASS: "+label);
}
const entries=readFileSync(credFile,"utf8").split("\n");
async function signIn(browser:Browser,username:string){
  const row=entries.find(x=>x.startsWith(username+" |"));
  if(!row)throw Error("Synthetic credentials missing for "+username);
  const [user,,password]=row.split("|").map(x=>x.trim());
  const context=await browser.newContext({baseURL:BASE});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await page.getByTestId("input-username").fill(user);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
  await page.getByTestId("button-sidebar-toggle").waitFor();
  return {context,page};
}
async function main(){
  const dbUrl=process.env.DATABASE_URL;
  if(!dbUrl || decodeURIComponent(new URL(dbUrl).pathname)!=="/"+DB_NAME) {
    throw Error("Refusing to use any database other than synthetic staging");
  }
  const pool=new Pool({connectionString:dbUrl,max:2});
  let browser:Browser|null=null;
  let managerContext:BrowserContext|null=null;
  let reviewerContext:BrowserContext|null=null;
  const taskIds:number[]=[];
  try{
    const r=await pool.query("SELECT current_database() AS name");
    check(r.rows[0]?.name===DB_NAME,"test connected to synthetic-only staging");
    const people=await pool.query(
      "SELECT username,id FROM users WHERE username = ANY($1::text[]) AND active=true",
      [["rcm_demo_manager","rcm_demo_reviewer","rcm_demo_biller"]],
    );
    const ids=new Map(people.rows.map(p=>[String(p.username),Number(p.id)]));
    check(ids.size===3,"three fictional workflow accounts present");
    const clinic=await pool.query("SELECT id FROM clinics WHERE name='Evergreen Demo Clinic'");
    check(clinic.rowCount===1,"fictional Evergreen clinic present");
    const clinicId=Number(clinic.rows[0].id);
    const tag=randomUUID().slice(0,12);
    const riskyName="TEST E2E RISK "+tag;
    const qaName="TEST E2E QA "+tag;
    const fixtures=await pool.query(
      `INSERT INTO tasks(patient_name,chart_number,clinic_id,bucket,status,priority,assigned_user_id,notes)
       VALUES ($1,$3,$5,'ready_for_billing','unassigned','high',NULL,'Disposable synthetic browser test'),
              ($2,$4,$5,'done','done','low',$6,'Disposable synthetic browser test')
       RETURNING id,patient_name`,
      [riskyName,qaName,"E2E-RISK-"+tag,"E2E-QA-"+tag,clinicId,ids.get("rcm_demo_biller")],
    );
    for(const t of fixtures.rows)taskIds.push(Number(t.id));
    const riskId=Number(fixtures.rows.find(x=>x.patient_name===riskyName).id);
    const qaId=Number(fixtures.rows.find(x=>x.patient_name===qaName).id);
    check(taskIds.length===2,"two temporary fictional tasks created");

    browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
    const manager=await signIn(browser,"rcm_demo_manager");
    managerContext=manager.context;
    await manager.page.goto("/rcm-taskboard",{waitUntil:"domcontentloaded"});
    await manager.page.getByRole("button",{name:"Table",exact:true}).click();
    const row=manager.page.getByTestId("rcm-taskboard-table").locator("tbody tr").filter({hasText:riskyName});
    await row.waitFor();
    await row.getByRole("button",{name:"Assign"}).click();
    const dialog=manager.page.getByRole("dialog",{name:"Assign existing task"});
    await dialog.waitFor();
    await dialog.locator("#rcm-assignee-picker").click();
    await manager.page.getByRole("option",{name:"Demo Billing Specialist"}).click();
    await dialog.getByRole("button",{name:"Request review"}).click();
    await dialog.getByRole("status").filter({hasText:"Approval requested"}).waitFor();
    check(true,"manager submitted high-risk assignment request via browser");

    // Before a second person's decision, the manager must not be able
    // to apply the high-risk assignment.
    await dialog.getByRole("button",{name:"Apply approved assignment"}).click();
    await dialog.getByRole("alert").filter({hasText:"Independent approval required"}).waitFor();
    check(true,"high-risk assignment blocked without independent approval");

    const reviewer=await signIn(browser,"rcm_demo_reviewer");
    reviewerContext=reviewer.context;
    await reviewer.page.goto("/rcm-approvals",{waitUntil:"domcontentloaded"});
    await reviewer.page.getByRole("heading",{name:"RCM Approval Queue"}).waitFor();
    const approvalCard=reviewer.page.getByText("Task #"+riskId+" · Billing").locator("xpath=ancestor::*[contains(@class,'rounded') and contains(@class,'border')][1]");
    // Use the matching task title as a stable review target.
    await approvalCard.waitFor();
    await approvalCard.getByRole("button",{name:"Approve"}).click();
    await reviewer.page.getByRole("status").filter({hasText:"review approved"}).waitFor();
    check(true,"separate reviewer approved exact assignment via browser");

    await dialog.getByRole("button",{name:"Apply approved assignment"}).click();
    await dialog.waitFor({state:"hidden"});
    const changed=await pool.query("SELECT assigned_user_id,status::text AS status FROM tasks WHERE id=$1",[riskId]);
    check(changed.rows[0].assigned_user_id===ids.get("rcm_demo_biller") && changed.rows[0].status==="assigned",
      "approved browser assignment updated original synthetic task");

    await manager.page.goto("/rcm-quality",{waitUntil:"domcontentloaded"});
    await manager.page.getByRole("heading",{name:"RCM Quality Assurance"}).waitFor();
    const qaText=manager.page.getByText(qaName);
    await qaText.waitFor();
    await qaText.locator("..").getByRole("button",{name:"Submit QA review"}).click();
    await manager.page.getByRole("status").filter({hasText:"QA review saved for task #"+qaId}).waitFor();
    const qa=await pool.query("SELECT verdict,score FROM rcm_quality_reviews WHERE source='tasks' AND record_id=$1",[qaId]);
    check(qa.rowCount===1 && qa.rows[0].verdict==="passed" && qa.rows[0].score===100,"QA review recorded via real browser");

    const approval=await pool.query("SELECT status FROM rcm_task_approvals WHERE task_id=$1",[riskId]);
    check(approval.rowCount===1 && approval.rows[0].status==="consumed","approval recorded as consumed");
    const audit=await pool.query(
      "SELECT count(*)::int AS n FROM rcm_access_audit WHERE payload->>'taskId'=ANY($1::text[]) OR payload->>'recordId'=ANY($1::text[])",
      [taskIds.map(String)],
    );
    check(audit.rows[0].n>=4,"assignment, approval, and QA events exist in audit ledger");
    console.log("PASS: full browser assignment/review/QA workflow verified on fictional disposable records");
  }finally{
    if(managerContext)await managerContext.close().catch(()=>{});
    if(reviewerContext)await reviewerContext.close().catch(()=>{});
    if(browser)await browser.close().catch(()=>{});
    const cleanupClient=await pool.connect();
    try{
      if(taskIds.length){
        await cleanupClient.query("BEGIN");
        await cleanupClient.query(
          "DELETE FROM rcm_access_audit WHERE payload->>'taskId'=ANY($1::text[]) OR payload->>'recordId'=ANY($1::text[])",
          [taskIds.map(String)],
        );
        await cleanupClient.query("DELETE FROM notifications WHERE task_id=ANY($1::int[])",[taskIds]);
        await cleanupClient.query("DELETE FROM task_activity WHERE task_id=ANY($1::int[])",[taskIds]);
        await cleanupClient.query("DELETE FROM tasks WHERE id=ANY($1::int[])",[taskIds]);
        await cleanupClient.query("COMMIT");
        console.log("PASS: temporary fictional records and related test audit/history cleared");
      }
    }catch(cleanup){
      await cleanupClient.query("ROLLBACK").catch(()=>{});
      console.error("WARNING: cleanup failed; inspect synthetic staging fixtures before re-running");
      throw cleanup;
    }finally{
      cleanupClient.release();
      await pool.end();
    }
  }
}
main().catch(error=>{
  console.error("RCM browser workflow test failed:",error instanceof Error?error.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
