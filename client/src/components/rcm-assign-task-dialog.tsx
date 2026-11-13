import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type BoardTask = {
  id:number; itemKey:string; source:string; department:string; clinicName:string|null;
  assignedUserId:number|null; assigneeName:string|null; priority:string|null;
};
type Assignee = {id:number;fullName:string};

export function RcmAssignTaskDialog({
  task, onClose, onAssigned,
}:{
  task:BoardTask|null;
  onClose:()=>void;
  onAssigned:()=>void;
}){
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [selection,setSelection]=useState("unassigned");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!task){setAssignees([]);setError("");return;}
    const controller=new AbortController();
    setSelection(task.source==="tasks" && task.assignedUserId!==null ? String(task.assignedUserId) : "unassigned");
    setError("");setNotice("");setLoading(true);setAssignees([]);
    fetch(task.source==="tasks" ? `/api/rcm/taskboard/tasks/${task.id}/assignees` : `/api/rcm/taskboard/legacy/${task.source}/${task.id}/assignees`,{credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async response=>{
        const payload=await response.json();
        if(!response.ok)throw new Error(payload.message||"Unable to load assignees");
        return payload as {users:Assignee[]};
      })
      .then(data=>{if(!controller.signal.aborted){setAssignees(data.users); if(task.source!=="tasks"&&task.assigneeName){const selected=data.users.find(u=>u.fullName===task.assigneeName);if(selected)setSelection(String(selected.id));}}})
      .catch(e=>{if(!controller.signal.aborted)setError((e as Error).message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[task?.itemKey,task?.assignedUserId]);

  async function save(){
    if(!task)return;
    const assignedUserId=selection==="unassigned"?null:Number(selection);
    if(assignedUserId!==null&&!assignees.some(x=>x.id===assignedUserId)){
      setError("Select an eligible employee or Unassigned.");return;
    }
    setSaving(true);setError("");setNotice("");
    try{
      const path=task.source==="tasks"
        ? `/api/rcm/taskboard/tasks/${task.id}/assignee`
        : `/api/rcm/taskboard/legacy/${task.source}/${task.id}/assignee`;
      const body=task.source==="tasks"
        ? {assignedUserId,expectedAssignedUserId:task.assignedUserId}
        : {assignedUserId,expectedAssignedName:task.assigneeName};
      const response=await fetch(path,{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
      });
      const payload=await response.json();
      if(!response.ok)throw new Error(payload.message||"Unable to save assignment");
      onAssigned();
      onClose();
    }catch(e){setError((e as Error).message);}
    finally{setSaving(false);}
  }

  async function requestApproval(){
    if(!task)return;
    const requestedAssigneeId=selection==="unassigned"?null:Number(selection);
    if(requestedAssigneeId!==null&&!assignees.some(x=>x.id===requestedAssigneeId)){
      setError("Select an eligible employee or Unassigned.");return;
    }
    setSaving(true);setError("");setNotice("");
    try{
      const response=await fetch(`/api/rcm/taskboard/tasks/${task.id}/approval-request`,{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({requestedAssigneeId,expectedAssigneeId:task.assignedUserId}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||"Unable to request approval");
      setNotice("Approval requested. A separate reviewer must approve it before you can save the assignment.");
    }catch(e){setError((e as Error).message);}
    finally{setSaving(false);}
  }

  const riskApprovalRequired=task?.source==="tasks" && (task.priority==="high"||task.priority==="critical");
  const taskIsOpen=!!task;
  return <Dialog open={taskIsOpen} onOpenChange={open=>{if(!open&&!saving)onClose();}}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Assign existing task</DialogTitle>
        <DialogDescription>Assignment updates the original tracker record and writes an audit entry. Only employees authorized for the record’s clinic and department are eligible.</DialogDescription>
      </DialogHeader>
      {task&&<div className="space-y-3">
        <p className="text-sm text-muted-foreground">{task.itemKey} · {task.department} · {task.clinicName||"Clinic not recorded"}</p>
        <div className="space-y-1.5">
          <Label htmlFor="rcm-assignee-picker">Employee</Label>
          <Select disabled={loading||saving||!!error&&assignees.length===0} value={selection} onValueChange={setSelection}>
            <SelectTrigger id="rcm-assignee-picker"><SelectValue placeholder={loading?"Loading employees…":"Choose an employee"}/></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignees.map(person=><SelectItem key={person.id} value={String(person.id)}>{person.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {task.source==="tasks"&&task.assignedUserId!==null&&!assignees.some(u=>u.id===task.assignedUserId)&&
          <p className="text-xs text-muted-foreground">Current assignee is no longer eligible for this scope. Choose an eligible employee or Unassigned.</p>}
        {riskApprovalRequired&&<p className="text-sm text-amber-700">High-risk assignment: request independent review, then save this exact assignment after approval.</p>}
        {notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
        {task.source!=="tasks" && !!task.assigneeName && !assignees.some(u=>u.fullName===task.assigneeName) && !loading && <p className="text-xs text-amber-700">The existing legacy assignee could not be matched to an eligible unique account. Select an employee explicitly before saving.</p>}
        {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
        {riskApprovalRequired && <Button variant="outline" disabled={loading||saving||!!error&&assignees.length===0} onClick={requestApproval}>Request review</Button>}
        <Button disabled={loading||saving||!!error&&assignees.length===0} onClick={save}>{saving?"Assigning…":riskApprovalRequired?"Apply approved assignment":"Save assignment"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
