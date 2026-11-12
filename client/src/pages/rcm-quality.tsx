import {useCallback,useEffect,useState} from "react";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {useAuth} from "@/lib/auth";

type QaTask={id:number;patientName:string;bucket:string;status:string;clinicName:string|null;assignedUserId:number};
type QaForm={score:string;verdict:"passed"|"needs_correction";note:string};
const blank=():QaForm=>({score:"100",verdict:"passed",note:""});
export default function RcmQualityReviewPage(){
 const {user}=useAuth();
 const [queue,setQueue]=useState<QaTask[]>([]);
 const [forms,setForms]=useState<Record<number,QaForm>>({});
 const [busyId,setBusyId]=useState<number|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [loading,setLoading]=useState(true);
 const load=useCallback(async(signal?:AbortSignal)=>{
   if(!user)return;
   setLoading(true);setError("");
   try{
    const r=await fetch("/api/rcm/quality/queue",{credentials:"same-origin",cache:"no-store",signal});
    const data=await r.json();if(!r.ok)throw new Error(data.message||"Unable to load QA queue");
    if(!signal?.aborted)setQueue(data.queue);
   }catch(e){if(!signal?.aborted)setError((e as Error).message);}
   finally{if(!signal?.aborted)setLoading(false);}
 },[user?.id]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);
 async function submit(task:QaTask){
   const state=forms[task.id]||blank();
   const score=Number(state.score);
   if(!Number.isInteger(score)||score<0||score>100){setError("Quality score must be an integer from 0 to 100.");return;}
   setBusyId(task.id);setError("");setNotice("");
   try{
     const r=await fetch("/api/rcm/quality/reviews",{
       method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({taskId:task.id,score,verdict:state.verdict,note:state.note.trim()||undefined}),
     });
     const data=await r.json();if(!r.ok)throw new Error(data.message||"Unable to save review");
     setNotice(`QA review saved for task #${task.id}.`);
     await load();
   }catch(e){setError((e as Error).message);}
   finally{setBusyId(null);}
 }
 function setField(id:number,updates:Partial<QaForm>){
   setForms(old=>({...old,[id]:{...(old[id]||blank()),...updates}}));
 }
 return <main className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
  <header><h1 className="text-2xl font-semibold">RCM Quality Assurance</h1>
   <p className="text-sm text-muted-foreground">Independent review of completed Verification/Billing tasks in your assigned clinics. Reviews do not alter patient or task workflow status.</p>
  </header>
  <Button variant="outline" disabled={loading||busyId!==null} onClick={()=>void load()}>{loading?"Loading…":"Refresh queue"}</Button>
  {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
  {notice&&<p className="text-sm text-green-700" role="status">{notice}</p>}
  {!loading&&queue.length===0&&<p className="text-sm text-muted-foreground">No completed tasks await independent quality review in your permitted scope.</p>}
  <div className="grid md:grid-cols-2 gap-3">
   {queue.map(task=>{
    const state=forms[task.id]||blank();
    return <Card key={task.id}><CardHeader className="pb-2">
      <CardTitle className="text-base">Task #{task.id} · {task.bucket==="for_verification"?"Verification":"Billing"}</CardTitle>
    </CardHeader><CardContent className="space-y-3">
      <p className="text-sm">{task.patientName}</p>
      <p className="text-sm text-muted-foreground">{task.clinicName||"Clinic unknown"} · Status: {task.status}</p>
      <div className="flex flex-wrap gap-3">
       <label className="text-sm space-y-1"><span className="block">Score (0–100)</span>
         <Input type="number" min="0" max="100" step="1" className="w-28" value={state.score} onChange={e=>setField(task.id,{score:e.target.value})}/>
       </label>
       <label className="text-sm space-y-1"><span className="block">QA result</span>
         <Select value={state.verdict} onValueChange={value=>setField(task.id,{verdict:value as QaForm["verdict"]})}>
           <SelectTrigger className="w-44"><SelectValue/></SelectTrigger>
           <SelectContent><SelectItem value="passed">Passed</SelectItem><SelectItem value="needs_correction">Needs correction</SelectItem></SelectContent>
         </Select>
       </label>
      </div>
      <Input maxLength={1000} placeholder="Optional internal review note (avoid patient identifiers)" value={state.note} onChange={e=>setField(task.id,{note:e.target.value})}/>
      <Button disabled={busyId!==null} onClick={()=>void submit(task)}>{busyId===task.id?"Saving…":"Submit QA review"}</Button>
    </CardContent></Card>;
   })}
  </div>
  <p className="text-xs text-muted-foreground">Quality results are saved in a separate audit-backed ledger. Correction requests and re-review cycles will require a dedicated workflow.</p>
 </main>;
}
