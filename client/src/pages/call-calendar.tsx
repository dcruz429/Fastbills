import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

type CalendarView = "month" | "week" | "day" | "agenda";

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

function isOverdue(call: any): boolean {
  if (["Resolved", "Completed", "Cancelled"].includes(call.callStatus)) return false;
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
        if (!form.patientName) set("patientName", task.patientName || "");
        if (task.clinic?.name && !form.clinic) set("clinic", task.clinic.name);
        if (task.insurance?.name && !form.insurance) set("insurance", task.insurance.name);
        if (task.assignedUserId && !form.assignedUserId) set("assignedUserId", String(task.assignedUserId));
        if (task.priority && !form.priority) set("priority", task.priority);
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
                  <SelectItem key={t.id} value={String(t.id)}>{t.patientName} (#{t.id})</SelectItem>
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
function RecordAttemptDialog({ open, onClose, call, users }: { open: boolean; onClose: () => void; call: any; users: User[] }) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState("");
  const [otherExplanation, setOtherExplanation] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("09:00");
  const [nextAssignedUserId, setNextAssignedUserId] = useState("");
  const [updateTaskStatus, setUpdateTaskStatus] = useState(false);
  const [newTaskStatus, setNewTaskStatus] = useState("");

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/calls"] }); toast({ title: "Call started" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", `/api/calls/${call?.id}/cancel`, { reason: cancelReason }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/calls"] }); toast({ title: "Call cancelled" }); setCancelOpen(false); onClose(); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!call) return null;

  const overdue = isOverdue(call);
  const isManager = currentUser && ["admin", "manager", "account_manager", "case_manager"].includes(currentUser.role);
  const isActive = !["Resolved", "Completed", "Cancelled"].includes(call.callStatus);

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
                <p className="font-semibold text-base">{call.patientName}</p>
                {call.phoneNumber && (
                  <a href={`tel:${call.phoneNumber}`} className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    <Phone className="h-3 w-3" />{call.phoneNumber}
                  </a>
                )}
                {call.clinic && <p className="text-sm text-muted-foreground">Clinic: {call.clinic}</p>}
                {call.insurance && <p className="text-sm text-muted-foreground">Insurance: {call.insurance}</p>}
              </div>
            </div>

            {/* Call Info */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Call Information</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={cn("text-xs", STATUS_COLORS[call.callStatus] || "")}>{call.callStatus}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Priority</span>
                  <Badge className={cn("text-xs capitalize", PRIORITY_COLORS[call.priority] || "")}>{call.priority}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Scheduled</span>
                  <span>{formatDate(call.scheduledAt)} {formatTime(call.scheduledAt)}</span>
                </div>
                {call.department && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Department</span>
                    <span>{call.department}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned To</span>
                  <span>{call.assignedUserName || <span className="text-muted-foreground italic">Unassigned</span>}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reason</span>
                  <span className="text-right max-w-[60%]">{call.callReason}</span>
                </div>
                {call.relatedTaskId && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Related Task</span>
                    <span className="text-blue-600 dark:text-blue-400">#{call.relatedTaskId}</span>
                  </div>
                )}
                {call.notes && (
                  <div className="pt-1">
                    <p className="text-muted-foreground text-xs mb-1">Notes</p>
                    <p className="text-sm bg-muted/40 rounded p-2">{call.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {isActive && (
              <div className="flex flex-wrap gap-2">
                {call.callStatus !== "In Progress" && (
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
  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PhoneMissed className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-lg font-medium">No calls found</p>
        <p className="text-sm">Try adjusting filters or schedule a new call</p>
      </div>
    );
  }

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of [...calls].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())) {
      const key = getDateKey(c.scheduledAt);
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [calls]);

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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CallCalendarPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<CalendarView>("agenda");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newCallOpen, setNewCallOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState("all");
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
    }
    // Agenda: use filter range or default 30 days
    return {
      apiDateFrom: filterDateFrom || getDateKey(new Date()),
      apiDateTo: filterDateTo || getDateKey(addDays(new Date(), 30)),
    };
  }, [view, currentDate, filterDateFrom, filterDateTo]);

  const queryParams = new URLSearchParams({
    dateFrom: apiDateFrom, dateTo: apiDateTo,
    ...(filterStatus !== "all" ? { callStatus: filterStatus } : {}),
    ...(filterDept !== "all" ? { department: filterDept } : {}),
    ...(filterAssigned !== "all" ? { assignedUserId: filterAssigned } : {}),
  });

  const { data: rawCalls = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/calls", apiDateFrom, apiDateTo, filterStatus, filterDept, filterAssigned],
    queryFn: () => fetch(`/api/calls?${queryParams}`).then(r => r.json()),
  });

  const { data: stats } = useQuery<any>({ queryKey: ["/api/calls/stats"] });

  const calls = useMemo(() => rawCalls.filter(c => {
    if (filterPriority !== "all" && c.priority !== filterPriority) return false;
    if (filterOverdueOnly && !isOverdue(c)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.patientName?.toLowerCase().includes(q) && !c.callReason?.toLowerCase().includes(q) && !c.clinic?.toLowerCase().includes(q) && !c.assignedUserName?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [rawCalls, filterPriority, filterOverdueOnly, search]);

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
    if (view === "day") return currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return "Agenda";
  }, [view, currentDate]);

  const openCall = useCallback((c: any) => {
    setSelectedCall(c);
    setDetailOpen(true);
  }, []);

  function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  const hasFilters = !!(search || filterStatus !== "all" || filterDept !== "all" || filterPriority !== "all" || filterAssigned !== "all" || filterDateFrom || filterDateTo || filterOverdueOnly);

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
          {(["month", "week", "day", "agenda"] as CalendarView[]).map(v => (
            <button key={v} onClick={() => setView(v)} data-testid={`tab-view-${v}`}
              className={cn("px-3 py-1.5 text-xs font-medium capitalize transition-colors", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {v}
            </button>
          ))}
        </div>
        {view !== "agenda" && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => navigate(-1)} data-testid="button-prev"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{rangeLabel}</span>
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
        {view === "agenda" && (
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
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setSearch(""); setFilterStatus("all"); setFilterDept("all"); setFilterPriority("all"); setFilterAssigned("all"); setFilterDateFrom(""); setFilterDateTo(""); setFilterOverdueOnly(false); }} data-testid="button-clear-filters">
            <X className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {/* Calendar Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-muted-foreground">Loading calls…</div>
          </div>
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
