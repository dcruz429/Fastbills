import {useCallback,useEffect,useState} from "react";
import {useAuth} from "@/lib/auth";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";

type Approval={
 id:number;taskId:number;requestedBy:number;requestedAssigneeId:number|null;expectedAssigneeId:number|null;
 riskLevel:"high"|"critical";status:string;requestedAt:string;clinicName:string|null;bucket:string;
};

export default function RcmApprovalsPage(){
 const {user}=useAuth();
 const [rows,setRows]=useState<Approval[]>([]);
 const [loading,setLoading]=useState(true);
 const [busyId,setBusyId]=useState<number|null>(null);
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async(signal?:AbortSignal)=>{
   if(!user)return;
   setLoading(true);setError("");
   try{
     const response=await fetch("/api/rcm/taskboard/approvals",{credentials:"same-origin",cache:"no-store",signal});
     const body=await response.json();
     if(!response.ok)throw new Error(body.message||"Unable to load approvals");
     if(!signal?.aborted)setRows(body.approvals);
   }catch(e){if(!signal?.aborted)setError((e as Error).message);}
   finally{if(!signal?.aborted)setLoading(false);}
 },[user?.id]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort();},[load]);
 async function decide(record:Approval,decision:"approved"|"rejected"){
   setBusyId(record.id);setError("");setNotice("");
   try{
     const response=await fetch(`/api/rcm/taskboard/approvals/${record.id}/decision`,{
       method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({decision,note:notes[record.id]?.trim()||undefined}),
     });
     const result=await response.json();
     if(!response.ok)throw new Error(result.message||"Unable to save review");
     setNotice(`Task ${record.taskId} review ${decision}. An authorized manager must apply the approved assignment.`);
     await load();
   }catch(e){setError((e as Error).message);}
   finally{setBusyId(null);}
 }
 return <main className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
   <header><h1 className="text-2xl font-semibold">RCM Approval Queue</h1>
     <p className="text-sm text-muted-foreground">Review high/critical assignment requests within your assigned clinic and department. You cannot approve your own request.</p>
   </header>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
   <Button variant="outline" disabled={loading||busyId!==null} onClick={()=>void load()}>{loading?"Loading…":"Refresh approvals"}</Button>
   {!loading&&rows.length===0&&<p className="text-sm text-muted-foreground">No reviewable pending approvals.</p>}
   <div className="grid gap-3">
     {rows.map(record=><Card key={record.id}>
       <CardHeader className="pb-2">
         <CardTitle className="flex flex-wrap justify-between gap-2 text-base">
           <span>Task #{record.taskId} · {record.bucket==="for_verification"?"Verification":"Billing"}</span>
           <Badge variant={record.riskLevel==="critical"?"destructive":"secondary"}>{record.riskLevel}</Badge>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-3">
         <p className="text-sm">Clinic: {record.clinicName||"Unknown"} · Current assignee ID: {record.expectedAssigneeId??"Unassigned"} · Proposed assignee ID: {record.requestedAssigneeId??"Unassigned"}</p>
         <p className="text-xs text-muted-foreground">Requested {new Date(record.requestedAt).toLocaleString()}</p>
         <Input aria-label={`Review note for task ${record.taskId}`} placeholder="Optional review note" maxLength={1000} value={notes[record.id]||""} onChange={e=>setNotes(current=>({...current,[record.id]:e.target.value}))}/>
         <div className="flex gap-2">
           <Button size="sm" disabled={busyId!==null} onClick={()=>void decide(record,"approved")}>Approve</Button>
           <Button size="sm" variant="destructive" disabled={busyId!==null} onClick={()=>void decide(record,"rejected")}>Reject</Button>
         </div>
       </CardContent>
     </Card>)}
   </div>
 </main>;
}
