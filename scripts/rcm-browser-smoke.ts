/**
 * Local-only real-browser smoke test with fictional FastbillsPH credentials.
 * Run after npm install --no-save playwright and npx playwright install chromium.
 * Browser visits localhost:5001 only. Does not submit mutations or print secrets.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE="http://127.0.0.1:5001";
const creds="/tmp/fastbills_rcm_synthetic_logins.txt";
function check(ok:unknown,label:string):asserts ok{
  if(!ok)throw Error("FAIL: "+label);
  console.log("PASS: "+label);
}
async function main(){
  const line=readFileSync(creds,"utf8").split("\n").find(x=>x.startsWith("rcm_demo_manager |"));
  if(!line)throw Error("Missing synthetic manager account");
  const [username,,password]=line.split("|").map(x=>x.trim());
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  try{
    const context=await browser.newContext({baseURL:BASE});
    const page=await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto("/",{waitUntil:"domcontentloaded"});
    await page.getByTestId("input-username").fill(username);
    await page.getByTestId("input-password").fill(password);
    await page.getByTestId("button-login").click();
    await page.getByTestId("button-sidebar-toggle").waitFor({state:"attached"});
    check(true,"fictional manager signs in through real browser form");
    await page.goto("/rcm-taskboard",{waitUntil:"domcontentloaded"});
    await page.getByRole("heading",{name:"RCM Task Board"}).waitFor();
    const kanban=page.getByTestId("rcm-taskboard-kanban");
    await kanban.waitFor();
    await page.getByText("5 visible on page 1").waitFor();
    check(await kanban.locator("section").count()>=2,"Kanban renders status columns");
    check(await kanban.getByText("TEST PATIENT 001").count()===1,"Kanban shows expected fictional Billing task");
    check(await kanban.getByText("TEST PATIENT 005").count()===0,"Verification record hidden from Billing manager");
    check(await kanban.getByText("TEST PATIENT 008").count()===0,"other-clinic record hidden from Billing manager");
    await page.getByRole("button",{name:"Table",exact:true}).click();
    const table=page.getByTestId("rcm-taskboard-table");
    await table.waitFor();
    check(await table.locator("tbody tr").count()===5,"Table displays exactly five authorized Billing tasks");
    await page.getByRole("textbox",{name:"Search tasks"}).fill("TEST PATIENT 003");
    await page.getByText("1 visible on page 1").waitFor();
    check(await table.locator("tbody tr").count()===1,"Table search filters tasks without changing scope");
    await page.getByRole("textbox",{name:"Search tasks"}).fill("");
    await page.getByText("5 visible on page 1").waitFor();
    await table.getByRole("button",{name:"Assign"}).first().click();
    const dialog=page.getByRole("dialog",{name:"Assign existing task"});
    await dialog.waitFor();
    check(await dialog.getByText("Evergreen Demo Clinic").count()>0,"assignment dialog identifies authorized clinic");
    await dialog.getByRole("button",{name:"Cancel"}).click();
    await dialog.waitFor({state:"hidden"});
    check(true,"manager can open and cancel assignment dialog without writes");
    await page.getByRole("button",{name:"Kanban",exact:true}).click();
    await kanban.waitFor();
    check(await page.getByText("5 visible on page 1").count()===1,"Kanban restored after switching views");
    console.log("PASS: local-only React Kanban/Table smoke tests complete; no mutation requests issued");
  } finally {
    await browser.close();
  }
}
main().catch(err=>{
  console.error("RCM browser smoke test failed:",err instanceof Error?err.message.split("\n")[0]:"unexpected browser error");
  process.exitCode=1;
});
