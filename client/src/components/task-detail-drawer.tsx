import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, PriorityBadge, BucketBadge } from "./status-badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { formatEST } from "@/lib/date-utils";
import { useState, useEffect } from "react";
import { Clock, User as UserIcon, ArrowRight, MessageSquare, History, Trash2, CheckSquare } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { TaskWithRelations, User, Clinic, Insurance, TaskActivity } from "@shared/schema";

type Props = {
  task: TaskWithRelations | null;
  open: boolean;
  onClose: () => void;
};

export function TaskDetailDrawer({ task, open, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [editData, setEditData] = useState<Record<string, any>>({});

  const { data: allUsers } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allClinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: allInsurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });
  const { data: activity } = useQuery<TaskActivity[]>({
    queryKey: ["/api/tasks", task?.id, "activity"],
    enabled: !!task?.id,
  });

  useEffect(() => {
    if (task) {
      const nameParts = task.patientName.includes(", ")
        ? task.patientName.split(", ")
        : ["", task.patientName];
      setEditData({
        patientLastName: nameParts[0],
        patientFirstName: nameParts.slice(1).join(", "),
        chartNumber: task.chartNumber || "",
        clinicId: task.clinicId,
        insuranceId: task.insuranceId,
        assignedUserId: task.assignedUserId,
        priority: task.priority,
        status: task.status,
        bucket: task.bucket,
        dueDate: task.dueDate ? formatEST(new Date(task.dueDate), "yyyy-MM-dd") : "",
        ieDate: task.ieDate ? formatEST(new Date(task.ieDate), "yyyy-MM-dd") : "",
        notes: task.notes || "",
        rtp: task.rtp || false,
        resolutionDate: task.resolutionDate ? formatEST(new Date(task.resolutionDate), "yyyy-MM-dd") : "",
      });
    }
  }, [task]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      await apiRequest("PATCH", `/api/tasks/${task?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "activity"] });
      toast({ title: "Task updated successfully" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/tasks/${task?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted successfully" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      await apiRequest("POST", `/api/tasks/${task?.id}/notes`, { note });
    },
    onSuccess: () => {
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task?.id, "activity"] });
    },
  });

  const handleSave = () => {
    const updates: Record<string, any> = {};
    const combinedName = `${editData.patientLastName?.trim() || ""}, ${editData.patientFirstName?.trim() || ""}`;
    if (combinedName !== task?.patientName) updates.patientName = combinedName;
    if ((editData.chartNumber || "") !== (task?.chartNumber || "")) updates.chartNumber = editData.chartNumber || null;
    if (editData.clinicId !== task?.clinicId) updates.clinicId = editData.clinicId ? Number(editData.clinicId) : null;
    if (editData.insuranceId !== task?.insuranceId) updates.insuranceId = editData.insuranceId ? Number(editData.insuranceId) : null;
    if (editData.assignedUserId !== task?.assignedUserId) updates.assignedUserId = editData.assignedUserId ? Number(editData.assignedUserId) : null;
    if (editData.priority !== task?.priority) updates.priority = editData.priority;
    if (editData.status !== task?.status) updates.status = editData.status;
    if (editData.bucket !== task?.bucket) updates.bucket = editData.bucket;
    const originalIeDate = task?.ieDate ? formatEST(new Date(task.ieDate), "yyyy-MM-dd") : "";
    if (editData.ieDate !== originalIeDate) {
      updates.ieDate = editData.ieDate || null;
    }
    if (editData.rtp !== (task?.rtp || false)) updates.rtp = editData.rtp;
    const originalResolutionDate = task?.resolutionDate ? formatEST(new Date(task.resolutionDate), "yyyy-MM-dd") : "";
    if (editData.resolutionDate !== originalResolutionDate) {
      updates.resolutionDate = editData.resolutionDate || null;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  if (!task) return null;

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.bucket !== "done";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        className="w-full sm:max-w-lg p-0"
        data-testid="task-detail-drawer"
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target?.closest("[role='listbox']") || target?.closest("[data-radix-popper-content-wrapper]")) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target?.closest("[role='listbox']") || target?.closest("[data-radix-popper-content-wrapper]")) {
            e.preventDefault();
          }
        }}
      >
        <SheetHeader className="p-4 pb-0">
          <div className="flex items-center gap-2 flex-wrap">
            <BucketBadge bucket={task.bucket} />
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.status === "dropped" && task.rtp && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400" data-testid="badge-rtp-drawer">
                RTP
              </span>
            )}
            {isOverdue && (
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 animate-pulse">OVERDUE</span>
            )}
          </div>
          <SheetTitle className="text-left mt-2" data-testid="text-task-patient-name">
            {task.patientName}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Task #{task.id} - Created {formatEST(new Date(task.createdAt), "MMM d, yyyy")}
          </p>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="p-4 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">First Name</Label>
                <Input
                  value={editData.patientFirstName || ""}
                  onChange={(e) => setEditData({ ...editData, patientFirstName: e.target.value })}
                  data-testid="input-task-patient-first-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Last Name</Label>
                <Input
                  value={editData.patientLastName || ""}
                  onChange={(e) => setEditData({ ...editData, patientLastName: e.target.value })}
                  data-testid="input-task-patient-last-name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Chart #</Label>
              <Input
                value={editData.chartNumber || ""}
                onChange={(e) => setEditData({ ...editData, chartNumber: e.target.value })}
                placeholder="Enter chart number"
                data-testid="input-task-chart-number"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority {editData.ieDate && <span className="text-xs">(auto from IE)</span>}</Label>
                <Select
                  value={editData.priority || "low"}
                  onValueChange={(v) => setEditData({ ...editData, priority: v })}
                  disabled={!!editData.ieDate}
                >
                  <SelectTrigger data-testid="select-task-priority" className={editData.ieDate ? "bg-muted cursor-not-allowed" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (0-10 days)</SelectItem>
                    <SelectItem value="medium">Medium (11-19 days)</SelectItem>
                    <SelectItem value="high">High (20-29 days)</SelectItem>
                    <SelectItem value="critical">Critical (30+ days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={editData.status || "unassigned"}
                  onValueChange={(v) => setEditData({ ...editData, status: v })}
                >
                  <SelectTrigger data-testid="select-task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(user?.role === "admin" || user?.role === "manager" || user?.role === "assigner") ? (
                      <>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="working_on_it">Working on it</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="billed">Billed</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </>
                    ) : user?.role === "verifier" ? (
                      <>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="working_on_it">Working on it</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </>
                    ) : user?.role === "biller" ? (
                      <>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="working_on_it">Working on it</SelectItem>
                        <SelectItem value="billed">Billed</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="working_on_it">Working on it</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                        <SelectItem value="billed">Billed</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                {(editData.status === "dropped" || task.status === "dropped") && (
                  <div className="flex items-center gap-2 mt-2">
                    <Checkbox
                      id="rtp-checkbox"
                      checked={editData.rtp || false}
                      onCheckedChange={(checked) => setEditData({ ...editData, rtp: !!checked })}
                      disabled={user?.role !== "verifier" && user?.role !== "admin" && user?.role !== "manager" && user?.role !== "assigner"}
                      data-testid="checkbox-rtp"
                    />
                    <Label htmlFor="rtp-checkbox" className="text-xs font-medium cursor-pointer">
                      RTP (Return to Partner)
                    </Label>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bucket</Label>
                <Select
                  value={editData.bucket || "for_verification"}
                  onValueChange={(v) => setEditData({ ...editData, bucket: v })}
                  disabled={user?.role !== "admin" && user?.role !== "manager"}
                >
                  <SelectTrigger data-testid="select-task-bucket">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="for_verification">For Verification</SelectItem>
                    <SelectItem value="ready_for_billing">Ready for Billing</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Clinic</Label>
                <Select
                  value={editData.clinicId?.toString() || "none"}
                  onValueChange={(v) => setEditData({ ...editData, clinicId: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger data-testid="select-task-clinic">
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allClinics?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Insurance</Label>
                <Select
                  value={editData.insuranceId?.toString() || "none"}
                  onValueChange={(v) => setEditData({ ...editData, insuranceId: v === "none" ? null : Number(v) })}
                >
                  <SelectTrigger data-testid="select-task-insurance">
                    <SelectValue placeholder="Select insurance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {allInsurances?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
                      <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assigned To</Label>
                {user?.role === "admin" || user?.role === "manager" || user?.role === "assigner" ? (
                  <Select
                    value={editData.assignedUserId?.toString() || "none"}
                    onValueChange={(v) => setEditData({ ...editData, assignedUserId: v === "none" ? null : Number(v) })}
                  >
                    <SelectTrigger data-testid="select-task-assigned">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {allUsers?.filter(u => u.active).slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map((u) => (
                        <SelectItem key={u.id} value={u.id.toString()}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={allUsers?.find(u => u.id === task?.assignedUserId)?.fullName || "Unassigned"}
                    disabled
                    data-testid="select-task-assigned"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">IE Date</Label>
                <Input
                  type="date"
                  value={editData.ieDate || ""}
                  onChange={(e) => {
                    const ieDate = e.target.value;
                    let dueDate = "";
                    let priority = editData.priority;
                    if (ieDate) {
                      const d = new Date(ieDate);
                      d.setDate(d.getDate() + 30);
                      dueDate = d.toISOString().split("T")[0];
                      const daysSinceIE = Math.floor((Date.now() - new Date(ieDate).getTime()) / (1000 * 60 * 60 * 24));
                      priority = daysSinceIE >= 30 ? "critical" : daysSinceIE >= 20 ? "high" : daysSinceIE >= 11 ? "medium" : "low";
                    }
                    setEditData({ ...editData, ieDate, dueDate, priority });
                  }}
                  data-testid="input-task-ie-date"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Due Date <span className="text-xs">(IE + 30)</span></Label>
                <Input
                  type="date"
                  value={editData.dueDate || ""}
                  readOnly
                  className="bg-muted cursor-not-allowed"
                  data-testid="input-task-due-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Resolution Date</Label>
                <Input
                  type="date"
                  value={editData.resolutionDate || ""}
                  onChange={(e) => setEditData({ ...editData, resolutionDate: e.target.value })}
                  data-testid="input-task-resolution-date"
                />
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-task"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>

            {(user?.role === "admin" || user?.role === "manager") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full"
                    data-testid="button-delete-task"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Task
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Task</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{task?.patientName}"? This action cannot be undone. All notes and activity history will also be removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                Notes
              </h3>
              {task.notes && (
                <div className="space-y-2 max-h-48 overflow-y-auto" data-testid="notes-display">
                  {task.notes.split(/(?=\[.+? - \d{4}-\d{2}-\d{2}T)/).filter(Boolean).reverse().map((block, idx) => {
                    const headerMatch = block.match(/^\[(.+?) - (.+?)\]\n?([\s\S]*)$/);
                    if (headerMatch) {
                      return (
                        <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5" data-testid={`note-item-${idx}`}>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <UserIcon className="h-3 w-3" />
                            <span className="font-medium text-foreground">{headerMatch[1]}</span>
                            <span className="mx-0.5">·</span>
                            <Clock className="h-3 w-3" />
                            <span>{formatEST(new Date(headerMatch[2]), "MMM d, h:mm a")}</span>
                          </div>
                          <p className="text-foreground whitespace-pre-wrap">{headerMatch[3].trim()}</p>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className="text-xs p-2.5 rounded-md bg-muted/50" data-testid={`note-item-${idx}`}>
                        <p className="text-foreground whitespace-pre-wrap">{block.trim()}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="text-sm"
                  data-testid="input-task-note"
                />
              </div>
              <Button
                size="sm"
                onClick={() => newNote.trim() && addNoteMutation.mutate(newNote.trim())}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                data-testid="button-add-note"
              >
                Add Note
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <History className="h-4 w-4" />
                Activity Log
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activity && activity.length > 0 ? (
                  activity.map((a) => (
                    <div
                      key={a.id}
                      className="text-xs p-2.5 rounded-md bg-muted/50 space-y-0.5"
                      data-testid={`activity-item-${a.id}`}
                    >
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserIcon className="h-3 w-3" />
                        <span className="font-medium text-foreground">{(a as any).userName || "System"}</span>
                        <span className="mx-0.5">·</span>
                        <Clock className="h-3 w-3" />
                        <span>{formatEST(new Date(a.timestamp), "MMM d, h:mm a")}</span>
                      </div>
                      <p className="font-medium text-foreground">{a.action}</p>
                      {a.field && (
                        <p className="text-muted-foreground">
                          {a.field}: <span className="line-through">{a.oldValue || "none"}</span>{" "}
                          <ArrowRight className="inline h-3 w-3" />{" "}
                          <span className="font-medium text-foreground">{a.newValue || "none"}</span>
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
