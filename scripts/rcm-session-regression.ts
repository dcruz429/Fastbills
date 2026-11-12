/**
 * Real-login session read-after-write regression test.
 * Run only against localhost synthetic staging after rebuilding/restarting.
 * Credentials are loaded from local owner-only file, not printed.
 * No task or patient records are read.
 */
import { readFileSync } from "node:fs";

const BASE="http://127.0.0.1:5001";
const PASSWORD_FILE="/tmp/fastbills_rcm_synthetic_logins.txt";
async function main(){
  const line=readFileSync(PASSWORD_FILE,"utf8").split("\n").find(x=>x.startsWith("rcm_demo_manager |"));
  if(!line)throw Error("Synthetic manager credentials missing");
  const [username,,password]=line.split("|").map(x=>x.trim());
  let failures=0;
  for(let i=1;i<=20;i++){
    const login=await fetch(BASE+"/api/auth/login",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({username,password}),
      signal:AbortSignal.timeout(15000),
    });
    if(login.status!==200)throw Error("Login "+i+" returned HTTP "+login.status);
    const cookie=login.headers.get("set-cookie")?.split(";")[0];
    if(!cookie)throw Error("Login "+i+" did not return a session cookie");
    const me=await fetch(BASE+"/api/auth/me",{
      headers:{Cookie:cookie},signal:AbortSignal.timeout(15000),
    });
    const board=await fetch(BASE+"/api/rcm/taskboard",{
      headers:{Cookie:cookie},signal:AbortSignal.timeout(15000),
    });
    const ok=me.status===200 && board.status===200;
    if(!ok)failures++;
    console.log("Login "+i+": immediate /me "+me.status+", immediate /taskboard "+board.status+(ok?" PASS":" FAIL"));
    // No body logs; do not disclose patient/task/user data.
  }
  console.log("Immediate authentication failures:",failures,"out of 20");
  if(failures!==0)throw Error("Session persistence regression test failed");
  console.log("PASS: all 20 real login sessions were immediately usable");
}
main().catch(err=>{
  console.error("Session regression test:",err instanceof Error?err.message:"unexpected error");
  process.exitCode=1;
});
