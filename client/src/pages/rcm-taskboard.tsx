import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutGrid, List, RefreshCw } from "lucide-react";

type Task = {
  id: number; itemKey: string; source: string; patientName: string | null; department: string;
  clinicId: number | null; clinicName: string | null;
  assigneeName: string | null; assignedUserId: number | null;
  status: string | null; bucket: string | null; priority: string | null;
  createdAt: string; dueDate: string | null;
};
type ApiResult = { tasks: Task[]; page: number; pageSize: number; limitedTo: string };
const stages = ["unassigned", "assigned", "working_on_it", "verified", "billed", "done", "dropped"] as const;
const departments = ["Verification", "Billing", "Posting", "Collections", "Denials", "Arbitration", "Checks", "Case Management / RTP", "Closed"] as const;
const labels: Record<string,string> = {
  unassigned: "Unassigned", assigned:"Assigned", working_on_it:"Working on it",
  verified:"Verified", billed:"Billed", done:"Done", dropped:"Dropped",
};
const pretty = (s:string|null) => labels[s || ""] || (s || "Unassigned").replace(/_/g," ");
const dateText = (d:string|null) => d ? new Date(d).toLocaleDateString() : "—";

export default function RcmTaskBoardPreview() {
  const {user} = useAuth();
  const [result,setResult] = useState<ApiResult|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [view,setView] = useState<"kanban"|"table">("kanban");
  const [search,setSearch] = useState("");
  const [department,setDepartment] = useState("all");
  const [stage,setStage] = useState("all");
  const [page,setPage] = useState(1);
  const [generation,setGeneration] = useState(0);

  useEffect(()=>{
    if(!user)return;
    const controller = new AbortController();
    setLoading(true);setError("");
    fetch(`/api/rcm/taskboard?page=${page}`, { credentials:"same-origin", signal:controller.signal, cache:"no-store" })
      .then(async r => {
        const body = await r.json();
        if(!r.ok)throw new Error(body.message || "Unable to load tasks");
        return body as ApiResult;
      })
      .then(body => {if(!controller.signal.aborted)setResult(body);})
      .catch(e => {if(!controller.signal.aborted){setResult(null);setError((e as Error).message);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[user?.id,page,generation]);

  const tasks = useMemo(()=>{
    const needle = search.trim().toLowerCase();
    return (result?.tasks||[]).filter(t=>
      (department==="all"||department===t.department) &&
      (stage==="all"||stage===(t.status||"unassigned").trim().toLowerCase().replace(/\s+/g,"_")) &&
      (!needle || [
        t.patientName||"",String(t.id),t.source,t.clinicName||"",t.assigneeName||"",
      ].some(value=>value.toLowerCase().includes(needle)))
    );
  },[result,search,department,stage]);

  const columns = useMemo(()=>{
    // Legacy trackers use display statuses (for example "Working on it").
    // Group case-insensitively so the Kanban agrees with Table.
    const normalize = (status: string | null) => (status || "unassigned").trim().toLowerCase().replace(/\s+/g, "_");
    return Array.from(new Set(tasks.map(t=>normalize(t.status)))).sort()
      .map(status=>({status,tasks:tasks.filter(t=>normalize(t.status)===status)}));
  },[tasks]);
  return <main className="p-4 md:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">RCM Task Board</h1>
        <p className="text-sm text-muted-foreground">Read-only preview of existing RCM tracker records. Kanban and Table use the same filtered records; task ID is shown with its originating tracker.</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant={view==="kanban"?"default":"outline"} onClick={()=>setView("kanban")}><LayoutGrid className="h-4 w-4 mr-1"/> Kanban</Button>
        <Button variant={view==="table"?"default":"outline"} onClick={()=>setView("table")}><List className="h-4 w-4 mr-1"/> Table</Button>
        <Button size="icon" variant="outline" aria-label="Refresh task board" onClick={()=>setGeneration(v=>v+1)}><RefreshCw className="h-4 w-4"/></Button>
      </div>
    </div>
    <Card><CardContent className="pt-5 flex flex-wrap items-center gap-3">
      <Input aria-label="Search tasks" className="w-full sm:w-56" placeholder="Search this page of tasks" value={search} onChange={e=>setSearch(e.target.value)}/>
      <Select value={department} onValueChange={setDepartment}>
        <SelectTrigger className="w-44" aria-label="Filter department"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="all">All departments</SelectItem>{departments.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={stage} onValueChange={setStage}>
        <SelectTrigger className="w-44" aria-label="Filter status"><SelectValue/></SelectTrigger>
        <SelectContent><SelectItem value="all">All statuses</SelectItem>{stages.map(s=><SelectItem key={s} value={s}>{pretty(s)}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground ml-auto">{tasks.length} visible on page {page}</span>
    </CardContent></Card>
    {error && <p role="alert" className="text-sm text-destructive">{error}. Ask an administrator to confirm your RCM department and clinic assignments.</p>}
    {loading && <p className="text-sm text-muted-foreground">Loading task board…</p>}
    {!loading&&!error&&(view==="kanban" ?
      <div className="flex gap-3 overflow-x-auto pb-4" data-testid="rcm-taskboard-kanban">
        {columns.map(column=><section key={column.status} className="min-w-64 w-72 shrink-0 rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex justify-between items-center"><h2 className="font-medium text-sm">{pretty(column.status)}</h2><Badge variant="secondary">{column.tasks.length}</Badge></div>
          {column.tasks.map(task=><Card key={task.itemKey}>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-sm break-words">{task.patientName||"Patient not recorded"}</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1 space-y-1">
              <p className="text-xs text-muted-foreground"># {task.itemKey} · {task.department} · {task.clinicName||"Unspecified clinic"}</p>
              <p className="text-xs">Assigned: {task.assigneeName||"Unassigned"}</p>
              <p className="text-xs">Due: {dateText(task.dueDate)}</p>
              <Badge variant="outline">{pretty(task.priority)}</Badge>
            </CardContent>
          </Card>)}
        </section>)}
        {columns.length===0&&<p className="text-sm text-muted-foreground">No tasks match the current filters on this page.</p>}
      </div> :
      <div className="overflow-x-auto rounded-lg border" data-testid="rcm-taskboard-table">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr className="text-left">
            {["Task","Patient","Department","Clinic","Assigned","Status","Priority","Due"].map(label=><th key={label} className="px-3 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>{tasks.map(task=><tr key={task.id} className="border-t">
            <td className="px-3 py-2">{task.itemKey}</td>
            <td className="px-3 py-2">{task.patientName||"—"}</td>
            <td className="px-3 py-2">{task.department}</td>
            <td className="px-3 py-2">{task.clinicName||"—"}</td>
            <td className="px-3 py-2">{task.assigneeName||"Unassigned"}</td>
            <td className="px-3 py-2">{pretty(task.status)}</td>
            <td className="px-3 py-2">{pretty(task.priority)}</td>
            <td className="px-3 py-2">{dateText(task.dueDate)}</td>
          </tr>)}</tbody>
        </table>
        {tasks.length===0&&<p className="p-4 text-sm text-muted-foreground">No tasks match the current filters on this page.</p>}
      </div>
    )}
    {!loading&&!error&&<div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">Showing at most {result?.pageSize||100} records per page. Filtering is within the current page. This preview does not edit or reassign tasks.</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>Previous</Button>
        <Button variant="outline" disabled={(result?.tasks.length||0)<(result?.pageSize||100)} onClick={()=>setPage(n=>n+1)}>Next</Button>
      </div>
    </div>}
  </main>;
}
