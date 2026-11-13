import {useEffect,useState} from "react";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useAuth} from "@/lib/auth";

type Department={department:string;openTasks:number;withoutDeadline:number;overdue:number;dueSoon:number;onTrack:number};
type SlaResponse={departments:Department[];warningHours:number;coverage:string};
export default function RcmSlaDashboardPage(){
 const {user}=useAuth();
 const [response,setResponse]=useState<SlaResponse|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  if(!user)return;
  const ctrl=new AbortController();setError("");setLoading(true);
  fetch("/api/rcm/sla/summary",{credentials:"same-origin",cache:"no-store",signal:ctrl.signal})
   .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.message||"Unable to load SLA dashboard");return data as SlaResponse;})
   .then(data=>{if(!ctrl.signal.aborted)setResponse(data);})
   .catch(e=>{if(!ctrl.signal.aborted)setError((e as Error).message);})
   .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
  return()=>ctrl.abort();
 },[user?.id,reload]);
 const departments=response?.departments||[];
 const sum=(key:"openTasks"|"withoutDeadline"|"overdue"|"dueSoon"|"onTrack")=>departments.reduce((acc,d)=>acc+d[key],0);
 return <main className="p-4 md:p-6 space-y-5">
   <header><h1 className="text-2xl font-semibold">RCM SLA Monitoring</h1>
     <p className="text-sm text-muted-foreground">Due-date monitoring for active Verification and Billing records within your permitted clinic and department assignments.</p>
   </header>
   <Button variant="outline" disabled={loading} onClick={()=>setReload(v=>v+1)}>{loading?"Loading…":"Refresh SLA dashboard"}</Button>
   {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
   {response&&<>
     <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
       {([
         ["Open tasks","openTasks"],
         ["Overdue","overdue"],
         ["Due in 24h","dueSoon"],
         ["On track","onTrack"],
         ["No due date","withoutDeadline"],
       ] as const).map(([label,key])=><Card key={key}><CardHeader className="pb-1"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{sum(key)}</p></CardContent></Card>)}
     </div>
     <Card><CardHeader><CardTitle className="text-base">Department status</CardTitle></CardHeader>
       <CardContent className="overflow-x-auto">
         <table className="w-full text-sm"><thead className="border-b"><tr className="text-left">
           {["Department","Open","Overdue","Due soon","On track","Missing deadline"].map(name=><th key={name} className="px-2 py-3 font-medium">{name}</th>)}
         </tr></thead><tbody>{departments.map(d=><tr key={d.department} className="border-b">
           <td className="px-2 py-3 font-medium">{d.department}</td>
           <td className="px-2 py-3">{d.openTasks}</td>
           <td className="px-2 py-3">{d.overdue}</td>
           <td className="px-2 py-3">{d.dueSoon}</td>
           <td className="px-2 py-3">{d.onTrack}</td>
           <td className="px-2 py-3">{d.withoutDeadline}</td>
         </tr>)}</tbody></table>
         {!departments.length&&<p className="py-3 text-sm text-muted-foreground">No eligible open tasks found for this scope.</p>}
       </CardContent>
     </Card>
   </>}
   <p className="text-xs text-muted-foreground">This dashboard reflects stored due dates, using a 24-hour warning threshold. Business-day calendars, holidays, and department-specific due-date policies require separate configuration and validation.</p>
 </main>;
}
