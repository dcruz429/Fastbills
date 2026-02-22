import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { User, Clinic, Insurance } from "@shared/schema";

export function CreateTaskDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientFirstName: "",
    patientLastName: "",
    chartNumber: "",
    clinicId: "",
    insuranceId: "",
    assignedUserId: "",
    priority: "low",
    dueDate: "",
    ieDate: "",
  });

  const { data: users } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: clinics } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });
  const { data: insurances } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setOpen(false);
      setFormData({
        patientFirstName: "",
        patientLastName: "",
        chartNumber: "",
        clinicId: "",
        insuranceId: "",
        assignedUserId: "",
        priority: "low",
        dueDate: "",
        ieDate: "",
      });
      toast({ title: "Task created successfully" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientFirstName.trim() || !formData.patientLastName.trim()) return;

    createMutation.mutate({
      patientName: `${formData.patientLastName.trim()}, ${formData.patientFirstName.trim()}`,
      chartNumber: formData.chartNumber.trim() || null,
      clinicId: formData.clinicId ? Number(formData.clinicId) : null,
      insuranceId: formData.insuranceId ? Number(formData.insuranceId) : null,
      assignedUserId: formData.assignedUserId ? Number(formData.assignedUserId) : null,
      priority: formData.priority,
      dueDate: formData.dueDate || null,
      ieDate: formData.ieDate || null,
      status: formData.assignedUserId ? "assigned" : "unassigned",
      bucket: "for_verification",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-task">
          <Plus className="h-4 w-4 mr-1.5" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" data-testid="create-task-dialog">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input
                value={formData.patientFirstName}
                onChange={(e) => setFormData({ ...formData, patientFirstName: e.target.value })}
                placeholder="First name"
                data-testid="input-new-patient-first-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input
                value={formData.patientLastName}
                onChange={(e) => setFormData({ ...formData, patientLastName: e.target.value })}
                placeholder="Last name"
                data-testid="input-new-patient-last-name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Chart #</Label>
            <Input
              value={formData.chartNumber}
              onChange={(e) => setFormData({ ...formData, chartNumber: e.target.value })}
              placeholder="Enter chart number"
              data-testid="input-new-chart-number"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Clinic</Label>
              <Select
                value={formData.clinicId || "none"}
                onValueChange={(v) => setFormData({ ...formData, clinicId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-new-clinic">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clinics?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Insurance</Label>
              <Select
                value={formData.insuranceId || "none"}
                onValueChange={(v) => setFormData({ ...formData, insuranceId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-new-insurance">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {insurances?.map((i) => (
                    <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select
                value={formData.assignedUserId || "none"}
                onValueChange={(v) => setFormData({ ...formData, assignedUserId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-new-assigned">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users?.filter(u => u.active).map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority {formData.ieDate && <span className="text-muted-foreground text-xs">(auto from IE)</span>}</Label>
              <Select
                value={formData.priority}
                onValueChange={(v) => setFormData({ ...formData, priority: v })}
                disabled={!!formData.ieDate}
              >
                <SelectTrigger data-testid="select-new-priority" className={formData.ieDate ? "bg-muted cursor-not-allowed" : ""}>
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
              <Label>IE Date</Label>
              <Input
                type="date"
                value={formData.ieDate}
                onChange={(e) => {
                  const ieDate = e.target.value;
                  let dueDate = "";
                  let priority = formData.priority;
                  if (ieDate) {
                    const d = new Date(ieDate);
                    d.setDate(d.getDate() + 30);
                    dueDate = d.toISOString().split("T")[0];
                    const daysSinceIE = Math.floor((Date.now() - new Date(ieDate).getTime()) / (1000 * 60 * 60 * 24));
                    priority = daysSinceIE >= 30 ? "critical" : daysSinceIE >= 20 ? "high" : daysSinceIE >= 11 ? "medium" : "low";
                  }
                  setFormData({ ...formData, ieDate, dueDate, priority });
                }}
                data-testid="input-new-ie-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date <span className="text-muted-foreground text-xs">(IE + 30 days)</span></Label>
              <Input
                type="date"
                value={formData.dueDate}
                readOnly
                className="bg-muted cursor-not-allowed"
                data-testid="input-new-due-date"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={createMutation.isPending || !formData.patientFirstName.trim() || !formData.patientLastName.trim()}
            data-testid="button-submit-task"
          >
            {createMutation.isPending ? "Creating..." : "Create Task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
