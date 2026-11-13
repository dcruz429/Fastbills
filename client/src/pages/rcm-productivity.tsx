import {useEffect,useState} from "react";
import {useAuth} from "@/lib/auth";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";

type DepartmentSummary={completions:number;units:number};
type LeaderboardRow={userId:number;name:string;completions:number;units:number;byDepartment:Record<string,DepartmentSummary>};
type Summary={
 from:string;to:string;completions:number;units:number;byDepartment:Record<string,DepartmentSummary>;
 leaderboard:LeaderboardRow[];truncated:boolean;
};
type Weights={weights:Record<string,number>};
const departments=["Verification","Billing","Posting","Collections","Denials","Arbitration","Checks","Case Management / RTP","Closed"];
const today=()=>new Date().toISOString().slice(0,10);
const lastMonth=()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10);

async function getJson<T>(url:string,options?:RequestInit):Promise<T>{
 const r=await fetch(url,{...options,credentials:"same-origin",cache:"no-store"});
 const j=await r.json();
 if(!r.ok)throw new Error(j.message||"Request failed");
 return j as T;
}
export default function RcmProductivityPage(){
 const {user}=useAuth();
 const [from,setFrom]=useState(lastMonth);
 const [to,setTo]=useState(today);
 const [summary,setSummary]=useState<Summary|null>(null);
 const [weights,setWeights]=useState<Record<string,number>>({});
 const [selectedDepartment,setSelectedDepartment]=useState("Verification");
 const [weightInput,setWeightInput]=useState("1");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [reload,setReload]=useState(0);
 useEffect(()=>{
   if(!user)return;
   const c=new AbortController();
   setError("");
   Promise.all([
     getJson<Summary>(`/api/rcm/productivity/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{signal:c.signal}),
     getJson<Weights>("/api/rcm/productivity/weights",{signal:c.signal}),
   ]).then(([report,config])=>{
     if(c.signal.aborted)return;
     setSummary(report);setWeights(config.weights);
     setWeightInput(String(config.weights[selectedDepartment]??1));
   }).catch(e=>{if(!c.signal.aborted){setSummary(null);setError((e as Error).message);}});
   return()=>c.abort();
 },[user?.id,from,to,reload]);
 const byWeight=departments.filter(name=>Object.prototype.hasOwnProperty.call(weights,name));
 async function saveWeight(){
   const number=Number(weightInput);
   if(!Number.isFinite(number)||number<0||number>100){setError("Weight must be between 0 and 100.");return;}
   setBusy(true);setError("");setNotice("");
   try{
     await getJson("/api/rcm/productivity/weights",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({department:selectedDepartment,weight:number})});
     setNotice("Productivity weight updated. The report is recalculated using the new configuration.");
     setReload(n=>n+1);
   }catch(e){setError((e as Error).message);}
   finally{setBusy(false);}
 }
 return <main className="p-4 md:p-6 space-y-5">
   <header><h1 className="text-2xl font-semibold">RCM Weighted Productivity</h1>
     <p className="text-sm text-muted-foreground">Read-only totals from historical Done/completed activity in each existing tracker, scoped to your assigned clinics and departments.</p>
   </header>
   <Card><CardContent className="pt-5 flex flex-wrap items-end gap-4">
     <label className="text-sm space-y-1">From<Input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
     <label className="text-sm space-y-1">To<Input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
     <Button variant="outline" onClick={()=>setReload(n=>n+1)}>Refresh</Button>
     <p className="text-xs text-muted-foreground">Maximum 94-day reporting window. Duplicate Done entries per record are counted once within that window.</p>
   </CardContent></Card>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
   {summary&&<>
     <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
       <Card><CardHeader><CardTitle className="text-sm">Completions</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{summary.completions}</p></CardContent></Card>
       <Card><CardHeader><CardTitle className="text-sm">Weighted units</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{summary.units.toFixed(2)}</p></CardContent></Card>
       <Card><CardHeader><CardTitle className="text-sm">Contributing staff</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{summary.leaderboard.length}</p></CardContent></Card>
     </div>
     {summary.truncated&&<p className="text-sm text-amber-700">This report exceeded its 20,000-event processing cap. The displayed totals are incomplete. Narrow the date range.</p>}
     <Card><CardHeader><CardTitle className="text-base">Employee leaderboard</CardTitle></CardHeader><CardContent className="overflow-x-auto">
       <table className="w-full text-sm"><thead className="text-left border-b"><tr><th className="py-2 pr-4">Employee</th><th className="py-2 pr-4 text-right">Completions</th><th className="py-2 text-right">Units</th></tr></thead>
         <tbody>{summary.leaderboard.map(row=><tr key={row.userId} className="border-b"><td className="py-2 pr-4">{row.name}</td><td className="py-2 pr-4 text-right">{row.completions}</td><td className="py-2 text-right">{row.units.toFixed(2)}</td></tr>)}</tbody>
       </table>
       {summary.leaderboard.length===0&&<p className="text-sm text-muted-foreground py-4">No completed work was found for this permitted scope and date range.</p>}
     </CardContent></Card>
     <Card><CardHeader><CardTitle className="text-base">Department completions</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
       {Object.entries(summary.byDepartment).map(([name,count])=><div key={name} className="rounded-md border p-3">
         <p className="text-sm font-medium">{name}</p><p className="text-sm">{count.completions} completions · {count.units.toFixed(2)} units</p>
       </div>)}
     </CardContent></Card>
   </>}
   {user?.role==="admin"&&<Card>
     <CardHeader><CardTitle className="text-base">Configure weighted units</CardTitle></CardHeader>
     <CardContent className="flex flex-wrap gap-3 items-end">
       <label className="text-sm space-y-1"><span className="block">Department</span>
         <Select value={selectedDepartment} onValueChange={value=>{setSelectedDepartment(value);setWeightInput(String(weights[value]??1));}}>
           <SelectTrigger className="w-56"><SelectValue/></SelectTrigger><SelectContent>{byWeight.map(name=><SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
         </Select>
       </label>
       <label className="text-sm space-y-1"><span className="block">Units per completion</span><Input type="number" step="0.25" min="0" max="100" className="w-36" value={weightInput} onChange={e=>setWeightInput(e.target.value)}/></label>
       <Button disabled={busy} onClick={saveWeight}>{busy?"Saving…":"Save weight"}</Button>
       <p className="text-xs text-muted-foreground w-full">Weight changes affect reports, not historical activity records. Review with department leaders before changing performance targets.</p>
     </CardContent>
   </Card>}
   <p className="text-xs text-muted-foreground">Productivity depends on existing activity logs. Reopened tasks and records without completion events may require reconciliation before payroll or performance decisions.</p>
 </main>;
}
