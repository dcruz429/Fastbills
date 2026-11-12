import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type UserRecord = { id: number; username: string; fullName: string; role: string; active: boolean };
type ClinicRecord = { id: number; name: string };
type Catalog = { departments: string[]; clinics: ClinicRecord[]; permissions: string[]; defaults: Record<string, string[]> };
type Access = {
  user: { id: number; username: string; full_name: string; role: string; active: boolean };
  departments: string[];
  clinicIds: number[];
  extraRoles: string[];
  overrides: Record<string, "allow" | "deny">;
};

async function request<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Request failed");
  return data as T;
}

const extraRoleOptions = [
  ["supervisor", "Supervisor"], ["department_head", "Department Head"],
  ["case_coordinator", "Case Coordinator"], ["quality_reviewer", "Quality Reviewer"],
  ["account_manager", "Accounts Manager"], ["payment_specialist", "Payment Specialist"],
  ["case_manager", "Case Manager"],
] as const;

/** Phase 1 scoped administration. No direct patient data is loaded here. */
export default function RcmAccessSettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [clinicIds, setClinicIds] = useState<number[]>([]);
  const [extraRoles, setExtraRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") return;
    Promise.all([request<UserRecord[]>("/api/users"), request<Catalog>("/api/rcm/access/catalog")])
      .then(([accounts, available]) => { setUsers(accounts); setCatalog(available); })
      .catch(e => setError((e as Error).message));
  }, [user?.role]);

  useEffect(() => {
    if (selectedId === null) { setAccess(null); return; }
    setAccess(null);
    setError("");
    request<Access>(`/api/rcm/access/users/${selectedId}`).then(data => {
      setAccess(data);
      setDepartments(data.departments);
      setClinicIds(data.clinicIds);
      setExtraRoles(data.extraRoles);
    }).catch(e => setError((e as Error).message));
  }, [selectedId]);

  if (user?.role !== "admin") {
    return <main className="p-6"><Card><CardContent className="pt-6">System administrator access required.</CardContent></Card></main>;
  }

  const toggle = <T,>(values: T[], value: T, checked: boolean): T[] =>
    checked ? Array.from(new Set([...values, value])) : values.filter(x => x !== value);

  async function saveScopes() {
    if (selectedId === null || !access) return;
    setSaving(true);setError("");setNotice("");
    try {
      await request(`/api/rcm/access/users/${selectedId}/scopes`, "PUT", { departments, clinicIds, extraRoles });
      setNotice("Access assignments saved. User permissions take effect on the next protected RCM request.");
      setAccess({ ...access, departments, clinicIds, extraRoles });
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function setOverride(permission: string, effect: "allow" | "deny" | null) {
    if (selectedId === null || !access) return;
    setSaving(true);setError("");setNotice("");
    try {
      await request(`/api/rcm/access/users/${selectedId}/override`, "PUT", { permission, effect });
      const overrides = { ...access.overrides };
      if (effect === null) delete overrides[permission];
      else overrides[permission] = effect;
      setAccess({ ...access, overrides });
      setNotice("Individual permission override saved.");
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <main className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">RCM Access Management</h1>
        <p className="text-sm text-muted-foreground">Assign departments, clinics, additional roles, and individual permissions to existing FastbillsPH accounts.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Select employee</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedId === null ? undefined : String(selectedId)} onValueChange={value => setSelectedId(Number(value))}>
            <SelectTrigger aria-label="Select an employee"><SelectValue placeholder="Choose an existing account" /></SelectTrigger>
            <SelectContent>
              {users.filter(u => u.active).map(u =>
                <SelectItem key={u.id} value={String(u.id)}>{u.fullName} ({u.username}) · {u.role}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {access && catalog && <>
        {access.user.role === "admin" && <p className="text-sm text-muted-foreground">System administrator permissions and scope are protected from modification.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Departments</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              {catalog.departments.map(name => <label key={name} className="flex gap-3 items-center text-sm">
                <Checkbox disabled={saving || access.user.role === "admin"} checked={departments.includes(name)} onCheckedChange={value => setDepartments(old => toggle(old,name,value===true))} />
                {name}
              </label>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Clinics</CardTitle></CardHeader>
            <CardContent className="grid gap-3 max-h-80 overflow-auto">
              {catalog.clinics.map(c => <label key={c.id} className="flex gap-3 items-center text-sm">
                <Checkbox disabled={saving || access.user.role === "admin"} checked={clinicIds.includes(c.id)} onCheckedChange={value => setClinicIds(old => toggle(old,c.id,value===true))} />
                {c.name}
              </label>)}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Additional RCM roles</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {extraRoleOptions.map(([key,label]) =>
              <label key={key} className="flex gap-2 items-center text-sm border rounded-md px-3 py-2">
                <Checkbox disabled={saving || access.user.role === "admin"} checked={extraRoles.includes(key)}
                  onCheckedChange={value => setExtraRoles(old => toggle(old,key,value===true))} />
                {label}
              </label>
            )}
          </CardContent>
        </Card>
        <Button disabled={saving || access.user.role === "admin"} onClick={saveScopes}>
          {saving ? "Saving…" : "Save department, clinic and role assignments"}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Individual permission overrides</CardTitle>
            <p className="text-sm text-muted-foreground">Inherit uses existing role rules. Explicit Deny takes precedence over role grants; all permissions still require matching clinic and department scope.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {catalog.permissions.map(p => {
              const current = access.overrides[p] || "inherit";
              return <div key={p} className="flex items-center justify-between gap-4 border-b py-2">
                <div><p className="text-sm font-medium">{p}</p>{current !== "inherit" && <Badge variant="secondary">{current}</Badge>}</div>
                <Select disabled={saving || access.user.role === "admin"} value={current} onValueChange={value => setOverride(p,value === "inherit" ? null : value as "allow"|"deny")}>
                  <SelectTrigger className="w-36" aria-label={`Permission override for ${p}`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="inherit">Inherit</SelectItem><SelectItem value="allow">Allow</SelectItem><SelectItem value="deny">Deny</SelectItem></SelectContent>
                </Select>
              </div>;
            })}
          </CardContent>
        </Card>
      </>}
      <p className="text-xs text-muted-foreground">Phase 1 only: existing task and tracker endpoints still use legacy authorization until subsequent integration and security tests are complete.</p>
    </main>
  );
}
