/**
 * Read-only Playwright coverage for independent approvals and QA screens.
 * Real browser, real login, synthetic-only localhost:5001 environment.
 * Does not press Request review, Approve, Reject or Submit QA review.
 */
import { chromium, type Browser } from "playwright";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:5001";
const creds = readFileSync("/tmp/fastbills_rcm_synthetic_logins.txt","utf8").split("\n");
function assert(value:unknown,label:string):asserts value {
  if(!value)throw new Error("FAIL: "+label);
  console.log("PASS: "+label);
}
async function login(browser:Browser,username:string){
  const entry=creds.find(x=>x.startsWith(username+" |"));
  if(!entry)throw new Error("Missing synthetic test account "+username);
  const [user,,password]=entry.split("|").map(x=>x.trim());
  const context=await browser.newContext({baseURL:BASE});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await page.getByTestId("input-username").fill(user);
  await page.getByTestId("input-password").fill(password);
  await page.getByTestId("button-login").click();
  await page.getByTestId("button-sidebar-toggle").waitFor();
  return {page,context};
}
async function main(){
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  try{
    const manager=await login(browser,"rcm_demo_manager");
    assert(true,"manager login through browser");
    await manager.page.goto("/rcm-taskboard",{waitUntil:"domcontentloaded"});
    await manager.page.getByText("5 visible on page 1").waitFor();
    await manager.page.getByRole("button",{name:"Table",exact:true}).click();
    await manager.page.getByRole("textbox",{name:"Search tasks"}).fill("TEST PATIENT 003");
    await manager.page.getByText("1 visible on page 1").waitFor();
    await manager.page.getByTestId("rcm-taskboard-table").getByRole("button",{name:"Assign"}).click();
    const dialog=manager.page.getByRole("dialog",{name:"Assign existing task"});
    await dialog.waitFor();
    assert(await dialog.getByText(/High-risk assignment/).count()===1,"high-risk task presents independent review warning");
    assert(await dialog.getByRole("button",{name:"Request review"}).count()===1,"high-risk dialog includes review request action");
    assert(await dialog.getByRole("button",{name:"Apply approved assignment"}).count()===1,"high-risk dialog uses approval-gated assignment action");
    await dialog.getByRole("button",{name:"Cancel"}).click();
    await manager.page.goto("/rcm-approvals",{waitUntil:"domcontentloaded"});
    await manager.page.getByRole("heading",{name:"RCM Approval Queue"}).waitFor();
    await manager.page.getByText("No reviewable pending approvals.").waitFor();
    assert(true,"approval queue loads without any pending request");

    await manager.page.goto("/rcm-quality",{waitUntil:"domcontentloaded"});
    await manager.page.getByRole("heading",{name:"RCM Quality Assurance"}).waitFor();
    const qaCard=manager.page.getByText("TEST PATIENT 007");
    await qaCard.waitFor();
    assert(await manager.page.getByRole("button",{name:"Submit QA review"}).count()>=1,"QA screen shows eligible completed fictional task without submitting");

    const verifier=await login(browser,"rcm_demo_verifier");
    assert(true,"Verification employee login through browser");
    await verifier.page.goto("/rcm-taskboard",{waitUntil:"domcontentloaded"});
    await verifier.page.getByText("2 visible on page 1").waitFor();
    const board=verifier.page.getByTestId("rcm-taskboard-kanban");
    await board.waitFor();
    assert(await board.getByText("TEST PATIENT 005").count()===1,"Verification employee sees own department");
    assert(await board.getByText("TEST PATIENT 001").count()===0,"Verification employee cannot see Billing record");
    await verifier.context.close();
    await manager.context.close();
    console.log("PASS: read-only approval, QA and Verification browser smoke completed; no writes");
  }finally{
    await browser.close();
  }
}
main().catch(e=>{
  console.error("RCM review browser smoke failed:",e instanceof Error?e.message.split("\n")[0]:"unexpected error");
  process.exitCode=1;
});
