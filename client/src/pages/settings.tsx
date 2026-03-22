import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Building2, ShieldCheck, Users, Pencil, Check, X, List, Briefcase, Wrench, RotateCcw } from "lucide-react";
import type { Clinic, Insurance, User, DropdownOption } from "@shared/schema";
import { DROPDOWN_CATEGORIES } from "@shared/schema";

function ClinicSettings() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const { data: clinics, isLoading } = useQuery<Clinic[]>({ queryKey: ["/api/clinics"] });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/clinics", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinics"] });
      setNewName("");
      toast({ title: "Clinic added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await apiRequest("PATCH", `/api/clinics/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinics"] });
      setEditingId(null);
      toast({ title: "Clinic updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/clinics/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinics"] });
      toast({ title: "Clinic removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="New clinic name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          data-testid="input-new-clinic"
        />
        <Button
          onClick={() => newName.trim() && addMutation.mutate(newName.trim())}
          disabled={!newName.trim() || addMutation.isPending}
          data-testid="button-add-clinic"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      <div className="space-y-1">
        {clinics?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`clinic-item-${c.id}`}>
            {editingId === c.id ? (
              <div className="flex items-center gap-2 flex-1 mr-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  data-testid={`input-edit-clinic-${c.id}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) updateMutation.mutate({ id: c.id, name: editName.trim() });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => editName.trim() && updateMutation.mutate({ id: c.id, name: editName.trim() })}
                  disabled={!editName.trim() || updateMutation.isPending}
                  data-testid={`button-save-clinic-${c.id}`}
                >
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingId(null)}
                  data-testid={`button-cancel-clinic-${c.id}`}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <>
                <span className="text-sm">{c.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                    data-testid={`button-edit-clinic-${c.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(c.id)}
                    data-testid={`button-delete-clinic-${c.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {clinics?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No clinics added yet</p>
        )}
      </div>
    </div>
  );
}

function InsuranceSettings() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const { data: insurances, isLoading } = useQuery<Insurance[]>({ queryKey: ["/api/insurances"] });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/insurances", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurances"] });
      setNewName("");
      toast({ title: "Insurance added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await apiRequest("PATCH", `/api/insurances/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurances"] });
      setEditingId(null);
      toast({ title: "Insurance updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/insurances/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/insurances"] });
      toast({ title: "Insurance removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="New insurance name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          data-testid="input-new-insurance"
        />
        <Button
          onClick={() => newName.trim() && addMutation.mutate(newName.trim())}
          disabled={!newName.trim() || addMutation.isPending}
          data-testid="button-add-insurance"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      <div className="space-y-1">
        {insurances?.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
          <div key={i.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`insurance-item-${i.id}`}>
            {editingId === i.id ? (
              <div className="flex items-center gap-2 flex-1 mr-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  data-testid={`input-edit-insurance-${i.id}`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editName.trim()) updateMutation.mutate({ id: i.id, name: editName.trim() });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => editName.trim() && updateMutation.mutate({ id: i.id, name: editName.trim() })}
                  disabled={!editName.trim() || updateMutation.isPending}
                  data-testid={`button-save-insurance-${i.id}`}
                >
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingId(null)}
                  data-testid={`button-cancel-insurance-${i.id}`}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <>
                <span className="text-sm">{i.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setEditingId(i.id); setEditName(i.name); }}
                    data-testid={`button-edit-insurance-${i.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(i.id)}
                    data-testid={`button-delete-insurance-${i.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        {insurances?.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No insurances added yet</p>
        )}
      </div>
    </div>
  );
}

function UserSettings() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isManager = currentUser?.role === "manager";
  const [newUser, setNewUser] = useState({ username: "", password: "", firstName: "", lastName: "", role: "verifier" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ username: "", firstName: "", lastName: "", role: "", password: "" });
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const { firstName, lastName, ...rest } = data;
      await apiRequest("POST", "/api/users", { ...rest, fullName: `${firstName} ${lastName}`.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUser({ username: "", password: "", firstName: "", lastName: "", role: "verifier" });
      toast({ title: "User created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const payload: any = { fullName: `${data.firstName} ${data.lastName}`.trim(), role: data.role, username: data.username };
      if (data.password) payload.password = data.password;
      await apiRequest("PATCH", `/api/users/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingId(null);
      toast({ title: "User updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const ceoAccessMutation = useMutation({
    mutationFn: async ({ id, ceoBoxAccess }: { id: number; ceoBoxAccess: boolean }) => {
      await apiRequest("PATCH", `/api/users/${id}/ceo-access`, { ceoBoxAccess });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "CEO Box access updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">First Name</Label>
          <Input
            value={newUser.firstName}
            onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
            placeholder="First name"
            data-testid="input-new-user-firstname"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Last Name</Label>
          <Input
            value={newUser.lastName}
            onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
            placeholder="Last name"
            data-testid="input-new-user-lastname"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Username</Label>
          <Input
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            placeholder="Username"
            data-testid="input-new-user-username"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Password</Label>
          <Input
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            placeholder="Password"
            data-testid="input-new-user-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select
            value={newUser.role}
            onValueChange={(v) => setNewUser({ ...newUser, role: v })}
          >
            <SelectTrigger data-testid="select-new-user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="verifier">Verifier</SelectItem>
              <SelectItem value="biller">Biller</SelectItem>
              <SelectItem value="assigner">Case Coordinator</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="payment_specialist">Payment Specialist</SelectItem>
              <SelectItem value="account_manager">Account Manager</SelectItem>
              <SelectItem value="case_manager">Case Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        onClick={() => {
          if (newUser.username.trim() && newUser.password.trim() && newUser.firstName.trim() && newUser.lastName.trim()) {
            addMutation.mutate(newUser);
          }
        }}
        disabled={addMutation.isPending || !newUser.username.trim() || !newUser.password.trim() || !newUser.firstName.trim() || !newUser.lastName.trim()}
        data-testid="button-add-user"
      >
        <Plus className="h-4 w-4 mr-1" />
        Create User
      </Button>

      <div className="space-y-1">
        {users?.slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map((u) => (
          <div key={u.id} className="py-2 px-3 rounded-md bg-muted/30" data-testid={`user-item-${u.id}`}>
            {editingId === u.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Username</Label>
                    <Input
                      value={editData.username}
                      onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                      className="h-8 text-sm"
                      data-testid={`input-edit-user-username-${u.id}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input
                      value={editData.firstName}
                      onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                      className="h-8 text-sm"
                      data-testid={`input-edit-user-firstname-${u.id}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input
                      value={editData.lastName}
                      onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                      className="h-8 text-sm"
                      data-testid={`input-edit-user-lastname-${u.id}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Select value={editData.role} onValueChange={(v) => setEditData({ ...editData, role: v })}>
                      <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-user-role-${u.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="verifier">Verifier</SelectItem>
                        <SelectItem value="biller">Biller</SelectItem>
                        <SelectItem value="assigner">Case Coordinator</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="payment_specialist">Payment Specialist</SelectItem>
                        <SelectItem value="account_manager">Account Manager</SelectItem>
                        <SelectItem value="case_manager">Case Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">New Password (leave blank to keep current)</Label>
                    <Input
                      type="password"
                      value={editData.password}
                      onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                      placeholder="Leave blank to keep current"
                      className="h-8 text-sm"
                      data-testid={`input-edit-user-password-${u.id}`}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => editData.username.trim() && editData.firstName.trim() && editData.lastName.trim() && updateMutation.mutate({ id: u.id, data: editData })}
                    disabled={!editData.username.trim() || !editData.firstName.trim() || !editData.lastName.trim() || updateMutation.isPending}
                    data-testid={`button-save-user-${u.id}`}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    data-testid={`button-cancel-user-${u.id}`}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{u.fullName}</span>
                  <Badge variant="secondary" className="no-default-active-elevate text-xs capitalize">
                    {u.role === "assigner" ? "Case Coordinator" : u.role === "payment_specialist" ? "Payment Specialist" : u.role === "account_manager" ? "Account Manager" : u.role === "case_manager" ? "Case Manager" : u.role}
                  </Badge>
                  {!u.active && (
                    <Badge variant="secondary" className="no-default-active-elevate text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                      Inactive
                    </Badge>
                  )}
                </div>
                {!isManager && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={u.ceoBoxAccess ? "Remove CEO Box access" : "Grant CEO Box access"}
                      onClick={() => ceoAccessMutation.mutate({ id: u.id, ceoBoxAccess: !u.ceoBoxAccess })}
                      disabled={ceoAccessMutation.isPending}
                      data-testid={`button-ceo-access-${u.id}`}
                      className={u.ceoBoxAccess ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground hover:text-amber-600 hover:bg-amber-50"}
                    >
                      <Briefcase className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { const parts = u.fullName.split(" "); const firstName = parts[0] || ""; const lastName = parts.slice(1).join(" ") || ""; setEditingId(u.id); setEditData({ username: u.username, firstName, lastName, role: u.role, password: "" }); }}
                      data-testid={`button-edit-user-${u.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant={u.active ? "secondary" : "default"}
                      onClick={() => toggleMutation.mutate({ id: u.id, active: !u.active })}
                      data-testid={`button-toggle-user-${u.id}`}
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(u.id)}
                      data-testid={`button-delete-user-${u.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DropdownSettings() {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState("denial_type");
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: options, isLoading } = useQuery<DropdownOption[]>({
    queryKey: ["/api/dropdown-options", selectedCategory],
  });

  const addMutation = useMutation({
    mutationFn: async (value: string) => {
      await apiRequest("POST", "/api/dropdown-options", { category: selectedCategory, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options", selectedCategory] });
      setNewValue("");
      toast({ title: "Option added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, value }: { id: number; value: string }) => {
      await apiRequest("PATCH", `/api/dropdown-options/${id}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options", selectedCategory] });
      setEditingId(null);
      toast({ title: "Option updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/dropdown-options/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dropdown-options", selectedCategory] });
      toast({ title: "Option removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const categoryLabel = DROPDOWN_CATEGORIES.find((c) => c.key === selectedCategory)?.label ?? selectedCategory;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger data-testid="select-dropdown-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DROPDOWN_CATEGORIES.map((cat) => (
              <SelectItem key={cat.key} value={cat.key}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={`New ${categoryLabel} option`}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          data-testid="input-new-dropdown-option"
        />
        <Button
          onClick={() => newValue.trim() && addMutation.mutate(newValue.trim())}
          disabled={!newValue.trim() || addMutation.isPending}
          data-testid="button-add-dropdown-option"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="space-y-1">
          {options?.slice().sort((a, b) => a.value.localeCompare(b.value)).map((opt) => (
            <div key={opt.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`dropdown-option-item-${opt.id}`}>
              {editingId === opt.id ? (
                <div className="flex items-center gap-2 flex-1 mr-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-7 text-sm"
                    data-testid={`input-edit-dropdown-option-${opt.id}`}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editValue.trim()) updateMutation.mutate({ id: opt.id, value: editValue.trim() });
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => editValue.trim() && updateMutation.mutate({ id: opt.id, value: editValue.trim() })}
                    disabled={!editValue.trim() || updateMutation.isPending}
                    data-testid={`button-save-dropdown-option-${opt.id}`}
                  >
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setEditingId(null)}
                    data-testid={`button-cancel-dropdown-option-${opt.id}`}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm">{opt.value}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditingId(opt.id); setEditValue(opt.value); }}
                      data-testid={`button-edit-dropdown-option-${opt.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(opt.id)}
                      data-testid={`button-delete-dropdown-option-${opt.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {options?.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No options added yet for this category</p>
          )}
        </div>
      )}
    </div>
  );
}

function MaintenanceSettings() {
  const { toast } = useToast();
  const [recoverResult, setRecoverResult] = useState<{ recovered: number; details: string[] } | null>(null);

  const recoverMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/recover-notes");
      return res.json();
    },
    onSuccess: (data) => {
      setRecoverResult(data);
      if (data.recovered > 0) {
        for (const key of ["/api/postings", "/api/collections", "/api/denials", "/api/arbitrations", "/api/closed"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        toast({ title: `Recovered notes for ${data.recovered} record${data.recovered !== 1 ? "s" : ""}` });
      } else {
        toast({ title: "No records needed recovery", description: "All transferred records already have their notes intact." });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="border rounded-md p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            Recover Missing Transfer Notes
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            Scans all trackers (Posting, Collections, Denials, Arbitration, Closed) for transferred records with empty notes and restores them from the original source record. Safe to run multiple times — only touches records that have no notes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recoverMutation.mutate()}
          disabled={recoverMutation.isPending}
          data-testid="button-recover-posting-notes"
        >
          {recoverMutation.isPending ? "Recovering..." : "Run Recovery"}
        </Button>
        {recoverResult && (
          <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs space-y-1">
            <p className="font-medium">{recoverResult.recovered} record{recoverResult.recovered !== 1 ? "s" : ""} recovered</p>
            {recoverResult.details.map((d, i) => (
              <p key={i} className="text-muted-foreground">{d}</p>
            ))}
            {recoverResult.recovered === 0 && (
              <p className="text-muted-foreground">Nothing to recover — all affected postings already have notes.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  if (!user || !["admin", "manager", "account_manager", "case_manager"].includes(user.role)) {
    return <Redirect to="/" />;
  }
  const showUsers = user.role === "admin" || user.role === "manager";
  const isAdmin = user.role === "admin";

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">
        {showUsers ? "Admin Settings" : "Settings"}
      </h1>

      <Tabs defaultValue="clinics">
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="clinics" data-testid="tab-clinics">
            <Building2 className="h-4 w-4 mr-1" />
            Clinics
          </TabsTrigger>
          <TabsTrigger value="insurances" data-testid="tab-insurances">
            <ShieldCheck className="h-4 w-4 mr-1" />
            Insurances
          </TabsTrigger>
          {showUsers && (
            <TabsTrigger value="dropdowns" data-testid="tab-dropdowns">
              <List className="h-4 w-4 mr-1" />
              Dropdowns
            </TabsTrigger>
          )}
          {showUsers && (
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-1" />
              Users
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="maintenance" data-testid="tab-maintenance">
              <Wrench className="h-4 w-4 mr-1" />
              Maintenance
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="clinics" className="mt-4">
          <Card>
            <CardHeader className="pb-3 px-4 pt-4">
              <h3 className="text-sm font-semibold">Manage Clinics</h3>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ClinicSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insurances" className="mt-4">
          <Card>
            <CardHeader className="pb-3 px-4 pt-4">
              <h3 className="text-sm font-semibold">Manage Insurance Providers</h3>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <InsuranceSettings />
            </CardContent>
          </Card>
        </TabsContent>

        {showUsers && (
          <TabsContent value="dropdowns" className="mt-4">
            <Card>
              <CardHeader className="pb-3 px-4 pt-4">
                <h3 className="text-sm font-semibold">Manage Dropdown Options</h3>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <DropdownSettings />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {showUsers && (
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="pb-3 px-4 pt-4">
                <h3 className="text-sm font-semibold">Manage Users</h3>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <UserSettings />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="maintenance" className="mt-4">
            <Card>
              <CardHeader className="pb-3 px-4 pt-4">
                <h3 className="text-sm font-semibold">Data Maintenance</h3>
                <p className="text-xs text-muted-foreground">Admin tools to repair or backfill data.</p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <MaintenanceSettings />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
