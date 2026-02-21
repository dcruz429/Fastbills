import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
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
import { Plus, Trash2, Building2, ShieldCheck, Users } from "lucide-react";
import type { Clinic, Insurance, User } from "@shared/schema";

function ClinicSettings() {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
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
        {clinics?.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`clinic-item-${c.id}`}>
            <span className="text-sm">{c.name}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deleteMutation.mutate(c.id)}
              data-testid={`button-delete-clinic-${c.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
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
        {insurances?.map((i) => (
          <div key={i.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`insurance-item-${i.id}`}>
            <span className="text-sm">{i.name}</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deleteMutation.mutate(i.id)}
              data-testid={`button-delete-insurance-${i.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
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
  const [newUser, setNewUser] = useState({ username: "", password: "", fullName: "", role: "verifier" });
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUser({ username: "", password: "", fullName: "", role: "verifier" });
      toast({ title: "User created" });
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

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full Name</Label>
          <Input
            value={newUser.fullName}
            onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
            placeholder="Full name"
            data-testid="input-new-user-fullname"
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
              <SelectItem value="assigner">Assigner</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        onClick={() => {
          if (newUser.username.trim() && newUser.password.trim() && newUser.fullName.trim()) {
            addMutation.mutate(newUser);
          }
        }}
        disabled={addMutation.isPending || !newUser.username.trim() || !newUser.password.trim() || !newUser.fullName.trim()}
        data-testid="button-add-user"
      >
        <Plus className="h-4 w-4 mr-1" />
        Create User
      </Button>

      <div className="space-y-1">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30" data-testid={`user-item-${u.id}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{u.fullName}</span>
              <Badge variant="secondary" className="no-default-active-elevate text-xs capitalize">
                {u.role}
              </Badge>
              {!u.active && (
                <Badge variant="secondary" className="no-default-active-elevate text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                  Inactive
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant={u.active ? "secondary" : "default"}
              onClick={() => toggleMutation.mutate({ id: u.id, active: !u.active })}
              data-testid={`button-toggle-user-${u.id}`}
            >
              {u.active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      <h1 className="text-xl font-bold tracking-tight" data-testid="text-settings-title">
        Admin Settings
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
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-1" />
            Users
          </TabsTrigger>
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
      </Tabs>
    </div>
  );
}
