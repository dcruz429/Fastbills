import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  CALL_STATUS_OPTIONS, CALL_OUTCOME_OPTIONS, CALL_DEPARTMENTS, CALL_FOLLOWUP_OUTCOMES,
} from "@shared/schema";
import type { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, Plus, RefreshCw, ChevronLeft, ChevronRight, Calendar, List,
  Clock, AlertTriangle, CheckCircle2, X, PhoneCall, PhoneOff,
  PhoneMissed, FileText, User as UserIcon, Filter, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarView = "list" | "month" | "week" | "day" | "agenda";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_COLORS: Record<string, string> = {
  "Scheduled": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "In Progress": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Attempted": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Follow-Up Required": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Rescheduled": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Resolved": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Completed": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Cancelled": "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
  "Missed": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "Overdue": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_DOT: Record<string, string> = {
  "Scheduled": "bg-blue-500",
  "In Progress": "bg-purple-500",
  "Attempted": "bg-yellow-500",
  "Follow-Up Required": "bg-yellow-500",
  "Rescheduled": "bg-orange-500",
  "Resolved": "bg-green-500",
  "Completed": "bg-green-500",
  "Cancelled": "bg-gray-400",
  "Missed": "bg-red-500",
};

const ROW_BORDER_COLOR: Record<string, string> = {
  "Scheduled": "border-l-blue-400",
  "In Progress": "border-l-purple-400",
  "Attempted": "border-l-yellow-400",
  "Follow-Up Required": "border-l-yellow-500",
  "Rescheduled": "border-l-orange-400",
  "Resolved": "border-l-green-400",
  "Completed": "border-l-green-400",
  "Cancelled": "border-l-gray-300",
  "Missed": "border-l-red-400",
};

function isOverdue(call: any): boolean {
  if (["Resolved", "Completed", "Cancelled", "Rescheduled", "Missed"].includes(call.callStatus)) return false;
  return new Date(call.scheduledAt) < new Date();
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

function getDateKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Call Card ─────────────────────────────────────────────────────────────────
function CallCard({ call, onClick, compact = false }: { call: any; onClick: () => void; compact?: boolean }) {
  const overdue = isOverdue(call);
  return (
    <button
      onClick={onClick}
      data-testid={`call-card-${call.id}`}
      className={cn(
        "w-full text-left rounded-md border px-2 py-1.5 text-xs transition-colors hover:opacity-80 cursor-pointer",
        overdue ? "border-red-400 bg-red-50 dark:bg-red-900/20" :
        call.callStatus === "Resolved" || call.callStatus === "Completed" ? "border-green-400 bg-green-50 dark:bg-green-900/20" :
        call.callStatus === "Cancelled" ? "border-gray-300 bg-gray-50 dark:bg-gray-800/30 opacity-60" :
        call.callStatus === "Follow-Up Required" || call.callStatus === "Rescheduled" ? "border-orange-400 bg-orange-50 dark:bg-orange-900/20" :
        "border-blue-400 bg-blue-50 dark:bg-blue-900/20"
      )}
    >
      <div className="flex items-center gap-1 font-medium truncate">
        {overdue && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
        <span className="truncate">{call.patientName}</span>
      </div>
      {!compact && (
        <>
          <div className="text-muted-foreground truncate">{formatTime(call.scheduledAt)}</div>
          {call.callReason && <div className="text-muted-foreground truncate">{call.callReason}</div>}
        </>
      )}
    </button>
  );
}

// ── New Call Dialog ───────────────────────────────────────────────────────────
function NewCallDialog({ open, onClose, prefill, tasks, users }: { open: boolean; onClose: () => void; prefill?: any; tasks: any[]; users: User[] }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    patientName: prefill?.patientName || "",
    relatedTaskId: prefill?.relatedTaskId ? String(prefill.relatedTaskId) : "",
    department: prefill?.department || "",
    assignedUserId: prefill?.assignedUserId ? String(prefill.assignedUserId) : "",
    scheduledDate: "",
    scheduledTime: "09:00",
    callReason: "",
    priority: prefill?.priority || "medium",
    phoneNumber: "",
    notes: "",
    clinic: prefill?.clinic || "",
    insurance: prefill?.insurance || "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.scheduledDate) throw new Error("Scheduled date is required");
      const scheduledAt = new Date(`${form.scheduledDate}T${form.scheduledTime}:00`);
      await apiRequest("POST", "/api/calls", {
        patientName: form.patientName, relatedTaskId: form.relatedTaskId || null,
        department: form.department || null, assignedUserId: form.assignedUserId || null,
        scheduledAt: scheduledAt.toISOString(), callReason: form.callReason,
        priority: form.priority, phoneNumber: form.phoneNumber || null,
        notes: form.notes || null, clinic: form.clinic || null, insurance: form.insurance || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      toast({ title: "Call scheduled successfully" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleTaskSelect = (taskId: string) => {
    set("relatedTaskId", taskId);
    if (taskId) {
      const task = tasks.find(t => String(t.id) === taskId);
      if (task) {
        if (task.patientName) set("patientName", task.patientName);
        if (task.clinic?.name) set("clinic", task.clinic.name);
        if (task.insurance?.name) set("insurance", task.insurance.name);
        if (task.assignedUserId) set("assignedUserId", String(task.assignedUserId));
        if (task.priority) set("priority", task.priority);
      }
    }
  };

  const canSave = form.patientName.trim() && form.scheduledDate && form.callReason.trim();

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-new-call">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="h-4 w-4" />Schedule New Call</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Patient Name <span className="text-red-500">*</span></Label>
            <Input value={form.patientName} onChange={e => set("patientName", e.target.value)} placeholder="Last, First" data-testid="input-call-patient-name" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Related Task</Label>
            <Select value={form.relatedTaskId || "none"} onValueChange={v => handleTaskSelect(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="select-related-task"><SelectValue placeholder="Link to a task (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- No related task --</SelectItem>
                {tasks.slice(0, 100).map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    #{t.id} — {t.patientName}{t.chartNumber ? ` · ${t.chartNumber}` : ""}{t.bucket ? ` [${t.bucket.replace(/_/g, " ")}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Scheduled Date <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.scheduledDate} onChange={e => set("scheduledDate", e.target.value)} data-testid="input-call-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Scheduled Time</Label>
              <Input type="time" value={form.scheduledTime} onChange={e => set("scheduledTime", e.target.value)} data-testid="input-call-time" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Call Reason <span className="text-red-500">*</span></Label>
            <Input value={form.callReason} onChange={e => set("callReason", e.target.value)} placeholder="e.g. Insurance verification follow-up" data-testid="input-call-reason" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Select value={form.department || "none"} onValueChange={v => set("department", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- None --</SelectItem>
                  {CALL_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "critical"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Assigned To</Label>
            <Select value={form.assignedUserId || "none"} onValueChange={v => set("assignedUserId", v === "none" ? "" : v)}>
              <SelectTrigger data-testid="select-call-assigned"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Unassigned --</SelectItem>
                {users.filter(u => u.active !== false).sort((a,b) => a.fullName.localeCompare(b.fullName)).map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone Number</Label>
            <Input value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)} placeholder="(555) 000-0000" data-testid="input-call-phone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Clinic</Label>
              <Input value={form.clinic} onChange={e => set("clinic", e.target.value)} placeholder="Clinic name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Insurance</Label>
              <Input value={form.insurance} onChange={e => set("insurance", e.target.value)} placeholder="Insurance" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Initial Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} data-testid="textarea-call-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!canSave || createMutation.isPending} data-testid="button-save-call">
            {createMutation.isPending ? "Scheduling..." : "Schedule Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Record Attempt Dialog ─────────────────────────────────────────────────────
function RecordAttemptDialog({ open, onClose, call, users, defaultOutcome }: { open: boolean; onClose: () => void; call: any; users: User[]; defaultOutcome?: string }) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState(defaultOutcome || "");
  const [otherExplanation, setOtherExplanation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(defaultOutcome ? CALL_FOLLOWUP_OUTCOMES.includes(defaultOutcome) : false);
  const [nextDate, setNextDate] = useState(defaultOutcome && defaultOutcome !== "Wrong Number" ? addDays(new Date(), 1).toISOString().split("T")[0] : "");
  const [nextTime, setNextTime] = useState("09:00");
  const [nextAssignedUserId, setNextAssignedUserId] = useState("");
  const [updateTaskStatus, setUpdateTaskStatus] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState("");

  // Reset state when dialog opens with a new call/outcome
  useEffect(() => {
    if (open) {
      setOutcome(defaultOutcome || "");
      setOtherExplanation("");
      setContactPerson("");
      setNotes("");
      setFollowUpRequired(defaultOutcome ? CALL_FOLLOWUP_OUTCOMES.includes(defaultOutcome) : false);
      setNextDate(defaultOutcome && defaultOutcome !== "Wrong Number" ? addDays(new Date(), 1).toISOString().split("T")[0] : "");
      setNextTime("09:00");
      setNextAssignedUserId("");
      setUpdateTaskStatus(false);
      setNewTaskStatus("");
    }
  }, [open, defaultOutcome]);

  const isFollowUpOutcome = CALL_FOLLOWUP_OUTCOMES.includes(outcome);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error("Outcome is required");
      let nextScheduledAt: string | null = null;
      if (followUpRequired && nextDate) {
        nextScheduledAt = new Date(`${nextDate}T${nextTime}:00`).toISOString();
      }
      await apiRequest("POST", `/api/calls/${call.id}/attempts`, {
        outcome, otherExplanation: outcome === "Other" ? otherExplanation : undefined,
        contactPerson: contactPerson || null, notes: notes || null,
        followUpRequired, nextScheduledAt,
        nextAssignedUserId: nextAssignedUserId || null,
        updateTaskStatus, newTaskStatus: updateTaskStatus ? newTaskStatus : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", call.id, "attempts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", call.id, "activity"] });
      toast({ title: "Attempt recorded" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-record-attempt">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PhoneCall className="h-4 w-4" />Record Call Attempt</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="p-2 bg-muted/40 rounded-md text-sm">
            <span className="font-medium">{call.patientName}</span>
            {call.callReason && <span className="text-muted-foreground"> — {call.callReason}</span>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Outcome <span className="text-red-500">*</span></Label>
            <Select value={outcome || "none"} onValueChange={v => { setOutcome(v === "none" ? "" : v); if (CALL_FOLLOWUP_OUTCOMES.includes(v)) setFollowUpRequired(true); }}>
              <SelectTrigger data-testid="select-attempt-outcome"><SelectValue placeholder="Select outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Select --</SelectItem>
                {CALL_OUTCOME_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {outcome === "Other" && (
            <div className="space-y-1">
              <Label className="text-xs">Explanation <span className="text-red-500">*</span></Label>
              <Input value={otherExplanation} onChange={e => setOtherExplanation(e.target.value)} placeholder="Describe the outcome" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Contact Person</Label>
            <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Name of person spoken with" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Call notes..." data-testid="textarea-attempt-notes" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="followup" checked={followUpRequired} onCheckedChange={v => setFollowUpRequired(!!v)} data-testid="checkbox-followup" />
            <Label htmlFor="followup" className="text-xs cursor-pointer">Follow-up call required</Label>
          </div>
          {followUpRequired && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">Schedule Follow-Up</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} data-testid="input-followup-date" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Time</Label>
                  <Input type="time" value={nextTime} onChange={e => setNextTime(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["tomorrow", "3days", "7days"].map(q => {
                  const label = q === "tomorrow" ? "Tomorrow" : q === "3days" ? "In 3 Days" : "In 7 Days";
                  const days = q === "tomorrow" ? 1 : q === "3days" ? 3 : 7;
                  return (
                    <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => {
                      const d = addDays(new Date(), days);
                      setNextDate(d.toISOString().split("T")[0]);
                    }}>{label}</Button>
                  );
                })}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assign Follow-Up To</Label>
                <Select value={nextAssignedUserId || "same"} onValueChange={v => setNextAssignedUserId(v === "same" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same">Same as current ({call.assignedUserName || "Unassigned"})</SelectItem>
                    {users.filter(u => u.active !== false).sort((a,b) => a.fullName.localeCompare(b.fullName)).map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {call.relatedTaskId && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Checkbox id="updateTask" checked={updateTaskStatus} onCheckedChange={v => setUpdateTaskStatus(!!v)} />
                <Label htmlFor="updateTask" className="text-xs cursor-pointer">Update related task status (Task #{call.relatedTaskId})</Label>
              </div>
              {updateTaskStatus && (
                <Select value={newTaskStatus || "none"} onValueChange={v => setNewTaskStatus(v === "none" ? "" : v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="New task status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select --</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="working_on_it">Working on it</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!outcome || mutation.isPending} data-testid="button-save-attempt">
            {mutation.isPending ? "Saving..." : "Record Attempt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Call Detail Panel ─────────────────────────────────────────────────────────
function CallDetailPanel({ call, open, onClose, users }: { call: any | null; open: boolean; onClose: () => void; users: User[] }) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: freshCall } = useQuery<any>({
    queryKey: ["/api/calls", call?.id],
    enabled: !!call?.id && open,
  });

  const { data: attempts = [] } = useQuery<any[]>({
    queryKey: ["/api/calls", call?.id, "attempts"],
    enabled: !!call?.id && open,
  });

  const { data: activityLog = [] } = useQuery<any[]>({
    queryKey: ["/api/calls", call?.id, "activity"],
    enabled: !!call?.id && open,
  });

  const startMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/calls/${call?.id}/start`, {}); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", call?.id] });
      toast({ title: "Call started" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/calls/${call?.id}/cancel`, { reason: cancelReason }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calls", call?.id] });
      toast({ title: "Call cancelled" });
      setCancelOpen(false);
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!call) return null;

  const displayCall = freshCall || call;
  const overdue = isOverdue(displayCall);
  const isManager = currentUser && ["admin", "manager", "account_manager", "case_manager"].includes(currentUser.role);
  const isActive = !["Resolved", "Completed", "Cancelled"].includes(displayCall.callStatus);

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-lg p-0 overflow-y-auto" data-testid="call-detail-panel">
          <SheetHeader className="p-4 pb-0 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Call Details
              {overdue && <Badge variant="destructive" className="text-xs ml-auto">OVERDUE</Badge>}
            </SheetTitle>
          </SheetHeader>

          <div className="p-4 space-y-4">
            {/* Patient Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Patient</p>
              <div className="space-y-1">
                <p className="font-semibold text-base">{displayCall.patientName}</p>
                {displayCall.phoneNumber && (
                  <a href={`tel:${displayCall.phoneNumber}`} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    <Phone className="h-3 w-3" />{displayCall.phoneNumber}
                  </a>
                )}
                {displayCall.clinic && <p className="text-sm text-muted-foreground">Clinic: {displayCall.clinic}</p>}
                {displayCall.insurance && <p className="text-sm text-muted-foreground">Insurance: {displayCall.insurance}</p>}
              </div>
            </div>

            {/* Call Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Call Information</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={cn("text-xs", STATUS_COLORS[displayCall.callStatus] || "")}>{displayCall.callStatus}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={cn("text-xs capitalize", PRIORITY_COLORS[displayCall.priority] || "")}>{displayCall.priority}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Scheduled</span>
                  <span>{formatDate(displayCall.scheduledAt)} {formatTime(displayCall.scheduledAt)}</span>
                </div>
                {displayCall.department && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Department</span>
                    <span>{displayCall.department}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned To</span>
                  <span>{displayCall.assignedUserName || <span className="text-muted-foreground italic">Unassigned</span>}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reason</span>
                  <span className="text-right max-w-[60%]">{displayCall.callReason}</span>
                </div>
                {displayCall.relatedTaskId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Related Task</span>
                    <span className="text-blue-600 dark:text-blue-400">#{displayCall.relatedTaskId}</span>
                  </div>
                )}
                {displayCall.notes && (
                  <div className="pt-1">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    <p className="text-sm bg-muted/40 rounded p-2">{displayCall.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {isActive && (
              <div className="flex flex-wrap gap-2">
                {displayCall.callStatus !== "In Progress" && (
                  <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending} data-testid="button-start-call">
                    <PhoneCall className="h-3 w-3 mr-1" />Start Call
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setAttemptOpen(true)} data-testid="button-record-attempt">
                  <FileText className="h-3 w-3 mr-1" />Record Attempt
                </Button>
                {isManager && (
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCancelOpen(true)} data-testid="button-cancel-call">
                    <X className="h-3 w-3 mr-1" />Cancel Call
                  </Button>
                )}
              </div>
            )}

            {/* Attempt History */}
            {(attempts as any[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Call Attempts ({(attempts as any[]).length})
                </p>
                <div className="space-y-2">
                  {(attempts as any[]).map((a: any) => (
                    <div key={a.id} className="border rounded-md p-2.5 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge className={cn("text-xs", a.outcome.startsWith("Resolved") || a.outcome.startsWith("Spoke") ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800")}>
                          {a.outcome}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)} {formatTime(a.createdAt)}</span>
                      </div>
                      {a.userName && <p className="text-xs text-muted-foreground">By: {a.userName}</p>}
                      {a.contactPerson && <p className="text-xs text-muted-foreground">Spoke with: {a.contactPerson}</p>}
                      {a.notes && <p className="text-xs bg-muted/40 rounded p-1.5">{a.notes}</p>}
                      {a.durationSeconds && <p className="text-xs text-muted-foreground">Duration: {Math.round(a.durationSeconds / 60)}m {a.durationSeconds % 60}s</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Log */}
            {(activityLog as any[]).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Audit History</p>
                <div className="space-y-1.5">
                  {(activityLog as any[]).map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0 mt-0.5">{formatDate(a.createdAt)}</span>
                      <span className="shrink-0 font-medium text-foreground">{a.eventType}</span>
                      {a.userName && <span>by {a.userName}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {attemptOpen && (
        <RecordAttemptDialog open={attemptOpen} onClose={() => setAttemptOpen(false)} call={call} users={users} />
      )}

      <Dialog open={cancelOpen} onOpenChange={v => !v && setCancelOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cancel Call</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Cancellation Reason (optional)</Label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Back</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Call"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────
function MonthView({ date, calls, onCallClick }: { date: Date; calls: any[]; onCallClick: (c: any) => void }) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = getDateKey(new Date());

  const callsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of calls) {
      const key = getDateKey(c.scheduledAt);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [calls]);

  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7 border-l border-t">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
        <div key={d} className="border-r border-b py-1.5 text-center text-xs font-medium text-muted-foreground bg-muted/30">{d}</div>
      ))}
      {cells.map((day, i) => {
        const key = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
        const dayCalls = key ? (callsByDay[key] || []) : [];
        const isToday = key === today;
        const hasOverdue = dayCalls.some(c => isOverdue(c));
        return (
          <div key={i} className={cn("border-r border-b min-h-[90px] p-1.5", !day && "bg-muted/10", isToday && "bg-blue-50 dark:bg-blue-900/10")}>
            {day && (
              <>
                <div className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1", isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {dayCalls.slice(0, 3).map(c => (
                    <CallCard key={c.id} call={c} onClick={() => onCallClick(c)} compact />
                  ))}
                  {dayCalls.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center">+{dayCalls.length - 3} more</p>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────
function WeekView({ date, calls, onCallClick }: { date: Date; calls: any[]; onCallClick: (c: any) => void }) {
  const weekStart = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = getDateKey(new Date());

  const callsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of calls) {
      const key = getDateKey(c.scheduledAt);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [calls]);

  return (
    <div className="grid grid-cols-7 border-l border-t">
      {days.map(d => {
        const key = getDateKey(d);
        const isToday = key === today;
        return (
          <div key={key} className="border-r border-b py-1.5 text-center">
            <p className="text-xs text-muted-foreground">{d.toLocaleDateString("en-US", { weekday: "short" })}</p>
            <div className={cn("text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mx-auto", isToday ? "bg-primary text-primary-foreground" : "")}>
              {d.getDate()}
            </div>
          </div>
        );
      })}
      {days.map(d => {
        const key = getDateKey(d);
        const dayCalls = callsByDay[key] || [];
        return (
          <div key={key} className="border-r border-b p-1.5 min-h-[200px] space-y-1">
            {dayCalls.map(c => <CallCard key={c.id} call={c} onClick={() => onCallClick(c)} />)}
            {dayCalls.length === 0 && <p className="text-xs text-muted-foreground text-center pt-6">No calls</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────
function DayView({ date, calls, onCallClick }: { date: Date; calls: any[]; onCallClick: (c: any) => void }) {
  const key = getDateKey(date);
  const dayCalls = calls.filter(c => getDateKey(c.scheduledAt) === key).sort((a, b) =>
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <div className="border rounded-md">
      <div className="px-4 py-2 border-b bg-muted/30">
        <p className="font-medium">{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>
      <div className="p-3 space-y-2">
        {dayCalls.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <PhoneOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No calls scheduled for this day</p>
          </div>
        ) : dayCalls.map(c => (
          <div key={c.id} className="flex gap-3 items-start">
            <div className="shrink-0 text-xs text-muted-foreground w-16 pt-1.5">{formatTime(c.scheduledAt)}</div>
            <div className="flex-1">
              <CallCard call={c} onClick={() => onCallClick(c)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agenda View ───────────────────────────────────────────────────────────────
function AgendaView({ calls, onCallClick }: { calls: any[]; onCallClick: (c: any) => void }) {
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of [...calls].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())) {
      const key = getDateKey(c.scheduledAt);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [calls]);

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PhoneMissed className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-lg font-medium">No calls found</p>
        <p className="text-sm">Try adjusting filters or schedule a new call</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([dateKey, dayCalls]) => {
        const d = new Date(dateKey + "T12:00:00");
        const isToday = dateKey === getDateKey(new Date());
        return (
          <div key={dateKey}>
            <div className={cn("flex items-center gap-2 px-1 mb-2", isToday && "text-primary")}>
              <div className={cn("text-sm font-semibold", isToday && "text-primary")}>
                {isToday ? "Today — " : ""}{d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </div>
              <div className="flex-1 border-b" />
              <span className="text-xs text-muted-foreground">{dayCalls.length} call{dayCalls.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Time", "Patient", "Phone", "Department", "Reason", "Priority", "Status", "Attempts", "Assigned To", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayCalls.map(c => {
                    const overdue = isOverdue(c);
                    return (
                      <tr key={c.id} data-testid={`agenda-row-${c.id}`} className={cn("border-b hover:bg-muted/20 transition-colors", overdue && "bg-red-50 dark:bg-red-900/10")}>
                        <td className="px-3 py-2 whitespace-nowrap font-medium">{formatTime(c.scheduledAt)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {overdue && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                            {c.patientName}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {c.phoneNumber ? (
                            <a href={`tel:${c.phoneNumber}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                              <Phone className="h-3 w-3" />{c.phoneNumber}
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{c.department || "—"}</td>
                        <td className="px-3 py-2 max-w-[180px] truncate">{c.callReason}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge className={cn("text-xs capitalize", PRIORITY_COLORS[c.priority] || "")}>{c.priority}</Badge>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge className={cn("text-xs", STATUS_COLORS[c.callStatus] || "")}>{c.callStatus}</Badge>
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{c.assignedUserName || <span className="italic">Unassigned</span>}</td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onCallClick(c)} data-testid={`button-view-call-${c.id}`}>
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Move to Another Day Dialog ─────────────────────────────────────────────────
function MoveToAnotherDayDialog({ open, onClose, onSave, isPending }: { open: boolean; onClose: () => void; onSave: (iso: string) => void; isPending: boolean }) {
  const [option, setOption] = useState<"tomorrow" | "pick">("tomorrow");
  const [pickedDate, setPickedDate] = useState("");
  const tomorrowKey = addDays(new Date(), 1).toISOString().split("T")[0];
  const tomorrowLabel = new Date(tomorrowKey + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const handleSave = () => {
    const dateKey = option === "tomorrow" ? tomorrowKey : pickedDate;
    if (!dateKey) return;
    const d = new Date(`${dateKey}T09:00:00`);
    onSave(d.toISOString());
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Move Call To</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="radio" checked={option === "tomorrow"} onChange={() => setOption("tomorrow")} className="accent-primary" />
            <span className="text-sm">Tomorrow ({tomorrowLabel})</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="radio" checked={option === "pick"} onChange={() => setOption("pick")} className="accent-primary" />
            <span className="text-sm">Pick Date</span>
          </label>
          {option === "pick" && (
            <Input type="date" value={pickedDate} onChange={e => setPickedDate(e.target.value)} min={tomorrowKey} className="h-8 text-sm ml-5" data-testid="input-move-date" />
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending || (option === "pick" && !pickedDate)} data-testid="button-confirm-move">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Daily List View ────────────────────────────────────────────────────────────
function DailyListView({ date, calls, onCallClick, users }: { date: Date; calls: any[]; onCallClick: (c: any) => void; users: User[] }) {
  const { toast } = useToast();
  const todayKey = getDateKey(date);

  const dayCalls = useMemo(() =>
    calls.filter(c => getDateKey(c.scheduledAt) === todayKey)
         .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
  [calls, todayKey]);

  const nextCallMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of calls) {
      if (c.parentCallId && c.callStatus !== "Cancelled") {
        const existing = map[c.parentCallId];
        if (!existing || new Date(c.scheduledAt) < new Date(existing)) {
          map[c.parentCallId] = c.scheduledAt;
        }
      }
    }
    return map;
  }, [calls]);

  const [pendingCallId, setPendingCallId] = useState<number | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [attemptCall, setAttemptCall] = useState<any>(null);
  const [attemptOutcome, setAttemptOutcome] = useState<string>("");
  const [attemptOpen, setAttemptOpen] = useState(false);

  const quickMutation = useMutation({
    mutationFn: async ({ callId, action, nextDate }: { callId: number; action: string; nextDate?: string }) => {
      const tomorrow = addDays(new Date(), 1);
      tomorrow.setHours(9, 0, 0, 0);
      const tomorrowISO = tomorrow.toISOString();
      switch (action) {
        case "done":      return apiRequest("PATCH", `/api/calls/${callId}`, { callStatus: "Completed" });
        case "resolved":  return apiRequest("PATCH", `/api/calls/${callId}`, { callStatus: "Resolved", completedAt: new Date().toISOString() });
        case "voicemail": return apiRequest("POST", `/api/calls/${callId}/attempts`, { outcome: "Left Voicemail", followUpRequired: true, nextScheduledAt: tomorrowISO });
        case "wrong":     return apiRequest("POST", `/api/calls/${callId}/attempts`, { outcome: "Wrong Number", followUpRequired: false });
        case "callback":  return apiRequest("POST", `/api/calls/${callId}/attempts`, { outcome: "Patient Requested Callback", followUpRequired: true, nextScheduledAt: tomorrowISO });
        case "unable":    return apiRequest("POST", `/api/calls/${callId}/attempts`, { outcome: "No Answer", followUpRequired: true, nextScheduledAt: tomorrowISO });
        case "move":      return apiRequest("PATCH", `/api/calls/${callId}`, { scheduledAt: nextDate });
        default: throw new Error("Unknown action");
      }
    },
    onSuccess: (_, v) => {
      setPendingCallId(null);
      // Optimistic status map — immediately update the cache so the UI reflects the change without waiting for refetch
      const optimisticStatus: Record<string, string> = {
        done: "Completed", resolved: "Resolved",
        voicemail: "Rescheduled", wrong: "Attempted",
        callback: "Rescheduled", unable: "Follow-Up Required",
        move: "Rescheduled",
      };
      const newStatus = optimisticStatus[v.action];
      if (newStatus) {
        queryClient.setQueriesData<any[]>({ queryKey: ["/api/calls"] }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map(c => c.id === v.callId ? { ...c, callStatus: newStatus } : c);
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/calls"] });
      const msgs: Record<string, string> = {
        done: "Marked as Done", resolved: "Marked as Resolved",
        voicemail: "Voicemail recorded — follow-up set for tomorrow",
        wrong: "Marked as Wrong Number",
        callback: "Callback scheduled for tomorrow",
        unable: "Unable to reach — follow-up scheduled for tomorrow",
        move: "Call moved to new date",
      };
      toast({ title: msgs[v.action] || "Updated" });
    },
    onError: (e: Error) => { setPendingCallId(null); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const ATTEMPT_ACTION_OUTCOMES: Record<string, string> = {
    voicemail: "Left Voicemail",
    wrong: "Wrong Number",
    callback: "Patient Requested Callback",
    unable: "No Answer",
  };

  const handleAction = (callId: number, action: string) => {
    setPendingCallId(callId);
    if (action === "move") {
      setMoveOpen(true);
    } else if (ATTEMPT_ACTION_OUTCOMES[action]) {
      const call = dayCalls.find(c => c.id === callId);
      setAttemptCall(call);
      setAttemptOutcome(ATTEMPT_ACTION_OUTCOMES[action]);
      setAttemptOpen(true);
    } else {
      quickMutation.mutate({ callId, action });
    }
  };

  const handleMove = (isoDate: string) => {
    if (pendingCallId) { quickMutation.mutate({ callId: pendingCallId, action: "move", nextDate: isoDate }); }
    setMoveOpen(false);
    setPendingCallId(null);
  };

  if (dayCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PhoneOff className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-lg font-medium">No calls for this day</p>
        <p className="text-sm">Schedule a new call or navigate to another date</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Daily Patient List — {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </h2>
          <span className="text-xs text-muted-foreground">{dayCalls.length} call{dayCalls.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/10">
                {["Status", "Patient", "Phone", "Clinic", "Insurance", "Assigned To", "Call Reason", "Notes", "Next Call", "Actions"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayCalls.map(c => {
                const overdue = isOverdue(c);
                const borderCls = overdue ? "border-l-red-500" : (ROW_BORDER_COLOR[c.callStatus] || "border-l-gray-300");
                const dotCls = overdue ? "bg-red-500" : (STATUS_DOT[c.callStatus] || "bg-gray-400");
                const nextCallDate = nextCallMap[c.id];
                const isActive = !["Resolved", "Completed", "Cancelled"].includes(c.callStatus);
                const isMutating = quickMutation.isPending && pendingCallId === c.id;

                return (
                  <tr key={c.id} data-testid={`daily-row-${c.id}`}
                    className={cn("border-b border-l-4 hover:bg-muted/10 transition-colors", borderCls, !isActive && "opacity-70")}>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotCls, overdue && "animate-pulse")} />
                        <span className="text-xs font-medium">{overdue ? "Overdue" : c.callStatus}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => onCallClick(c)} className="font-medium hover:underline text-left whitespace-nowrap" data-testid={`button-view-daily-${c.id}`}>
                        {c.patientName}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {c.phoneNumber ? (
                        <a href={`tel:${c.phoneNumber}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-xs">
                          <Phone className="h-3 w-3" />{c.phoneNumber}
                        </a>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">{c.clinic || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">{c.insurance || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {c.assignedUserName ? c.assignedUserName : <span className="text-muted-foreground italic">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2.5 max-w-[150px] truncate text-xs">{c.callReason}</td>
                    <td className="px-3 py-2.5 max-w-[120px] text-xs">
                      {c.notes ? (
                        <span className="text-muted-foreground truncate block max-w-[120px]" title={c.notes}>
                          {c.notes.length > 35 ? c.notes.slice(0, 35) + "…" : c.notes}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {nextCallDate ? (
                        <span className="text-orange-600 dark:text-orange-400 font-medium">
                          {new Date(nextCallDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {isActive ? (
                        <div className="flex flex-wrap gap-1 min-w-[340px]">
                          <button onClick={() => handleAction(c.id, "done")} disabled={isMutating} data-testid={`btn-done-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700 disabled:opacity-50 whitespace-nowrap">
                            ✅ Done
                          </button>
                          <button onClick={() => handleAction(c.id, "resolved")} disabled={isMutating} data-testid={`btn-resolved-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700 disabled:opacity-50 whitespace-nowrap">
                            ✓ Resolved
                          </button>
                          <button onClick={() => handleAction(c.id, "move")} disabled={isMutating} data-testid={`btn-move-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700 disabled:opacity-50 whitespace-nowrap">
                            📅 Move
                          </button>
                          <button onClick={() => handleAction(c.id, "voicemail")} disabled={isMutating} data-testid={`btn-voicemail-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700 disabled:opacity-50 whitespace-nowrap">
                            📞 Voicemail
                          </button>
                          <button onClick={() => handleAction(c.id, "wrong")} disabled={isMutating} data-testid={`btn-wrong-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700 disabled:opacity-50 whitespace-nowrap">
                            🚫 Wrong #
                          </button>
                          <button onClick={() => handleAction(c.id, "callback")} disabled={isMutating} data-testid={`btn-callback-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700 disabled:opacity-50 whitespace-nowrap">
                            ⏱ Call Back
                          </button>
                          <button onClick={() => handleAction(c.id, "unable")} disabled={isMutating} data-testid={`btn-unable-${c.id}`}
                            className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700 disabled:opacity-50 whitespace-nowrap">
                            ✗ Unable
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">{c.callStatus}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MoveToAnotherDayDialog
        open={moveOpen}
        onClose={() => { setMoveOpen(false); setPendingCallId(null); }}
        onSave={handleMove}
        isPending={quickMutation.isPending}
      />
      {attemptCall && (
        <RecordAttemptDialog
          open={attemptOpen}
          onClose={() => { setAttemptOpen(false); setAttemptCall(null); setPendingCallId(null); }}
          call={attemptCall}
          users={users}
          defaultOutcome={attemptOutcome}
        />
      )}
    </>
  );
}

// ── Manager Dashboard ──────────────────────────────────────────────────────────
function ManagerDashboard({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data: agentStats = [] } = useQuery<any[]>({
    queryKey: ["/api/calls/agent-stats", dateFrom, dateTo],
    queryFn: ({ queryKey }) => {
      const [, df, dt] = queryKey as string[];
      return fetch(`/api/calls/agent-stats?dateFrom=${df}&dateTo=${dt}`, { credentials: "include" }).then(r => r.json());
    },
  });

  return (
    <div className="mt-5 rounded-md border overflow-hidden" data-testid="manager-dashboard">
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center gap-2">
        <UserIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Manager Dashboard</h3>
        <span className="text-xs text-muted-foreground ml-1">— agent stats for selected day</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="agent-stats-table">
          <thead>
            <tr className="border-b bg-muted/10">
              {["Agent", "Assigned", "Done", "Pending", "Rescheduled", "Success Rate"].map(h => (
                <th key={h} className={cn("px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap", h === "Agent" ? "text-left" : "text-center")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agentStats.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">No assigned calls for this day</td></tr>
            ) : agentStats.map((s: any) => (
              <tr key={s.userId} className="border-b hover:bg-muted/10 transition-colors" data-testid={`agent-row-${s.userId}`}>
                <td className="px-4 py-2 font-medium">{s.userName}</td>
                <td className="px-4 py-2 text-center">{s.assigned}</td>
                <td className="px-4 py-2 text-center text-green-600 dark:text-green-400 font-medium">{s.done}</td>
                <td className="px-4 py-2 text-center text-yellow-600 dark:text-yellow-400">{s.pending}</td>
                <td className="px-4 py-2 text-center text-orange-600 dark:text-orange-400">{s.rescheduled}</td>
                <td className="px-4 py-2 text-center">
                  <span className={cn("font-medium", s.successRate >= 80 ? "text-green-600 dark:text-green-400" : s.successRate >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400")}>
                    {s.successRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CallCalendarPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<CalendarView>("list");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newCallOpen, setNewCallOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterInsurance, setFilterInsurance] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterOverdueOnly, setFilterOverdueOnly] = useState(false);

  const isManager = currentUser && ["admin", "manager", "account_manager", "case_manager"].includes(currentUser.role);

  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: tasks = [] } = useQuery<any[]>({ queryKey: ["/api/tasks"] });

  // Compute visible date range for the API query
  const { apiDateFrom, apiDateTo } = useMemo(() => {
    const d = currentDate;
    if (view === "month") {
      return { apiDateFrom: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0], apiDateTo: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0] };
    } else if (view === "week") {
      const ws = startOfWeek(d);
      return { apiDateFrom: ws.toISOString().split("T")[0], apiDateTo: addDays(ws, 6).toISOString().split("T")[0] };
    } else if (view === "day") {
      const key = getDateKey(d);
      return { apiDateFrom: key, apiDateTo: key };
    } else if (view === "list") {
      // Load selected day + 30 more days so child calls (Next Call dates) are included
      return { apiDateFrom: getDateKey(d), apiDateTo: getDateKey(addDays(d, 30)) };
    }
    // Agenda: use filter range or default 30 days
    return {
      apiDateFrom: filterDateFrom || getDateKey(new Date()),
      apiDateTo: filterDateTo || getDateKey(addDays(new Date(), 30)),
    };
  }, [view, currentDate, filterDateFrom, filterDateTo]);

  const { data: rawCalls = [], isLoading, isFetching, refetch } = useQuery<any[]>({
    queryKey: ["/api/calls", apiDateFrom, apiDateTo, filterStatus, filterDept, filterAssigned],
    queryFn: ({ queryKey }) => {
      const [, dateFrom, dateTo, callStatus, department, assignedUserId] = queryKey as string[];
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (callStatus !== "all") params.set("callStatus", callStatus);
      if (department !== "all") params.set("department", department);
      if (assignedUserId !== "all") params.set("assignedUserId", assignedUserId);
      return fetch(`/api/calls?${params}`).then(r => r.json());
    },
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery<any>({ queryKey: ["/api/calls/stats"] });

  // Unique clinic/insurance values from loaded calls for filter dropdowns
  const uniqueClinics = useMemo(() => {
    const s = new Set<string>();
    rawCalls.forEach(c => { if (c.clinic) s.add(c.clinic); });
    return Array.from(s).sort();
  }, [rawCalls]);

  const uniqueInsurances = useMemo(() => {
    const s = new Set<string>();
    rawCalls.forEach(c => { if (c.insurance) s.add(c.insurance); });
    return Array.from(s).sort();
  }, [rawCalls]);

  const calls = useMemo(() => rawCalls.filter(c => {
    if (filterPriority !== "all" && c.priority !== filterPriority) return false;
    if (filterOverdueOnly && !isOverdue(c)) return false;
    if (filterClinic !== "all" && c.clinic !== filterClinic) return false;
    if (filterInsurance !== "all" && c.insurance !== filterInsurance) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.patientName?.toLowerCase().includes(q) && !c.callReason?.toLowerCase().includes(q) && !c.clinic?.toLowerCase().includes(q) && !c.assignedUserName?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rawCalls, filterPriority, filterOverdueOnly, filterClinic, filterInsurance, search]);

  const navigate = useCallback((dir: 1 | -1) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  }, [currentDate, view]);

  const rangeLabel = useMemo(() => {
    if (view === "month") return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (view === "week") {
      const ws = startOfWeek(currentDate);
      const we = addDays(ws, 6);
      return `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${we.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    if (view === "day" || view === "list") return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return "Agenda";
  }, [view, currentDate]);

  const openCall = useCallback((c: any) => {
    setSelectedCall(c);
    setDetailOpen(true);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch(""); setFilterStatus("all"); setFilterDept("all"); setFilterPriority("all");
    setFilterAssigned("all"); setFilterClinic("all"); setFilterInsurance("all");
    setFilterDateFrom(""); setFilterDateTo(""); setFilterOverdueOnly(false);
  }, []);

  const hasFilters = !!(search || filterStatus !== "all" || filterDept !== "all" || filterPriority !== "all" || filterAssigned !== "all" || filterClinic !== "all" || filterInsurance !== "all" || filterDateFrom || filterDateTo || filterOverdueOnly);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/80 backdrop-blur-sm flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />Call Center Calendar
          </h1>
          {stats && (
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>{stats.scheduledToday} today</span>
              <span className="text-green-600 dark:text-green-400">{stats.resolvedToday} resolved</span>
              {stats.overdueToday > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{stats.overdueToday} overdue</span>}
              {stats.followUpRequired > 0 && <span className="text-orange-600 dark:text-orange-400">{stats.followUpRequired} follow-up</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCurrentDate(new Date())} data-testid="button-today">Today</Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
          <Button size="sm" onClick={() => setNewCallOpen(true)} data-testid="button-new-call">
            <Plus className="h-3.5 w-3.5 mr-1" />New Call
          </Button>
        </div>
      </div>

      {/* View Tabs + Nav */}
      <div className="flex items-center gap-2 px-4 py-2 border-b flex-wrap">
        <div className="flex items-center border rounded-md overflow-hidden">
          {(["list", "month", "week", "day", "agenda"] as CalendarView[]).map(v => (
            <button key={v} onClick={() => setView(v)} data-testid={`tab-view-${v}`}
              className={cn("px-3 py-1.5 text-xs font-medium capitalize transition-colors", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {v === "list" ? "Daily" : v}
            </button>
          ))}
        </div>
        {view !== "agenda" && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(-1)} data-testid="button-prev"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[200px] text-center">{rangeLabel}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(1)} data-testid="button-next"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {calls.length} call{calls.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 px-4 py-2 border-b bg-muted/20">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-7 h-8 w-48 text-xs" placeholder="Search patients…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-calls" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-filter-call-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CALL_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-dept"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {CALL_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-8 w-32 text-xs" data-testid="select-filter-call-priority"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {["low", "medium", "high", "critical"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {uniqueClinics.length > 0 && (
          <Select value={filterClinic} onValueChange={setFilterClinic}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-clinic"><SelectValue placeholder="All Clinics" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clinics</SelectItem>
              {uniqueClinics.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {uniqueInsurances.length > 0 && (
          <Select value={filterInsurance} onValueChange={setFilterInsurance}>
            <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-insurance"><SelectValue placeholder="All Insurances" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Insurances</SelectItem>
              {uniqueInsurances.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {isManager && (
          <Select value={filterAssigned} onValueChange={setFilterAssigned}>
            <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-filter-assigned"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {(users as User[]).filter(u => u.active !== false).sort((a,b) => a.fullName.localeCompare(b.fullName)).map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(view === "agenda" || view === "list") && (
          <>
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} data-testid="input-filter-date-from" />
            <Input type="date" className="h-8 w-36 text-xs" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} data-testid="input-filter-date-to" />
          </>
        )}
        <div className="flex items-center gap-1.5">
          <Checkbox id="overdueOnly" checked={filterOverdueOnly} onCheckedChange={v => setFilterOverdueOnly(!!v)} data-testid="checkbox-overdue-only" />
          <Label htmlFor="overdueOnly" className="text-xs cursor-pointer text-muted-foreground">Overdue only</Label>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {/* Calendar Content */}
      <div className="flex-1 overflow-auto p-4 relative">
        {isFetching && !isLoading && (
          <div className="absolute top-2 right-4 z-10 flex items-center gap-1.5 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-full border shadow-sm">
            <RefreshCw className="h-3 w-3 animate-spin" />Updating…
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">Loading calls…</div>
          </div>
        ) : view === "list" ? (
          <>
            <DailyListView date={currentDate} calls={calls} onCallClick={openCall} users={users as User[]} />
            {isManager && <ManagerDashboard dateFrom={getDateKey(currentDate)} dateTo={getDateKey(currentDate)} />}
          </>
        ) : view === "month" ? (
          <MonthView date={currentDate} calls={calls} onCallClick={openCall} />
        ) : view === "week" ? (
          <WeekView date={currentDate} calls={calls} onCallClick={openCall} />
        ) : view === "day" ? (
          <DayView date={currentDate} calls={calls} onCallClick={openCall} />
        ) : (
          <AgendaView calls={calls} onCallClick={openCall} />
        )}
      </div>

      {/* Dialogs */}
      <NewCallDialog open={newCallOpen} onClose={() => setNewCallOpen(false)} tasks={tasks} users={users as User[]} />
      <CallDetailPanel call={selectedCall} open={detailOpen} onClose={() => { setDetailOpen(false); setSelectedCall(null); }} users={users as User[]} />
    </div>
  );
}
