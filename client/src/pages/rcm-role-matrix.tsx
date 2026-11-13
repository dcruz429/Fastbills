import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Role = { slug:string; label:string; is_system:boolean };
type Grant = {role_slug:string;permission_key:string;effect:"allow"|"deny"};
type Catalog = {roles:Role[];grants:Grant[];permissions:string[];defaults:Record<string,string[]>};

async function api<T>(url:string,method="GET",body?:object):Promise<T>{
  const r=await fetch(url,{method,credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const j=await r.json();if(!r.ok)throw new Error(j.message||"Request failed");return j as T;
}
export default function RcmRoleMatrixPage(){
  const {user}=useAuth();
  const [data,setData]=useState<Catalog|null>(null);
  const [role,setRole]=useState("");
  const [slug,setSlug]=useState("");
  const [label,setLabel]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function refresh(){
    const result=await api<Catalog>("/api/rcm/access/roles");
    setData(result);
    setRole(existing=>existing && result.roles.some(r=>r.slug===existing)?existing:result.roles.find(r=>!r.is_system)?.slug||"");
  }
  useEffect(()=>{if(user?.role==="admin")refresh().catch(e=>setError(e.message));},[user?.role]);
  if(user?.role!=="admin")return <main className="p-6">System administrator access required.</main>;
  const current=data?.roles.find(r=>r.slug===role);
  async function update(permission:string,value:string){
    setBusy(true);setNotice("");setError("");
    try {
      await api("/api/rcm/access/roles/permission","PUT",{role,permission,effect:value==="inherit"?null:value});
      await refresh();setNotice("Role permission saved.");
    }catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  async function create(){
    setBusy(true);setError("");setNotice("");
    try{
      await api("/api/rcm/access/roles","POST",{slug,label});
      await refresh();setRole(slug);setSlug("");setLabel("");setNotice("Custom role created. Grant permissions below.");
    }catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  return <main className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
    <h1 className="text-2xl font-semibold">RCM Role Permission Matrix</h1>
    <p className="text-sm text-muted-foreground">These grants apply to the new scoped RCM modules only. Existing FastbillsPH role checks remain unchanged until migrated and tested. Administrator role is protected.</p>
    {error&&<p className="text-sm text-destructive" role="alert">{error}</p>}
    {notice&&<p className="text-sm text-green-700" role="status">{notice}</p>}
    <Card><CardHeader><CardTitle className="text-base">Create custom RCM role</CardTitle></CardHeader>
      <CardContent className="flex gap-3 flex-wrap">
        <Input className="w-48" value={slug} onChange={e=>setSlug(e.target.value)} placeholder="role_slug" aria-label="Role slug"/>
        <Input className="w-56" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Display name" aria-label="Role name"/>
        <Button disabled={busy||!/^[a-z][a-z0-9_]{1,49}$/.test(slug)||label.trim().length<2} onClick={create}>Add Role</Button>
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle className="text-base">Role permissions</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger aria-label="Role to edit"><SelectValue placeholder="Choose role" /></SelectTrigger>
          <SelectContent>{data?.roles.map(r=><SelectItem key={r.slug} value={r.slug}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {current?.is_system&&<p className="text-sm">System role grants cannot be changed.</p>}
        <div className="divide-y">
          {data?.permissions.map(permission=>{
            const override=data.grants.find(g=>g.role_slug===role&&g.permission_key===permission)?.effect||"inherit";
            const baseline=data.defaults[role]?.includes(permission)?"Allow":"Deny";
            return <div key={permission} className="flex items-center justify-between gap-3 py-3">
              <div><p className="text-sm font-medium">{permission}</p><p className="text-xs text-muted-foreground">Default: {baseline}</p></div>
              <Select disabled={busy||current?.is_system||!role} value={override} onValueChange={value=>update(permission,value)}>
                <SelectTrigger className="w-36" aria-label={`Role permission for ${permission}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="inherit">Inherit</SelectItem><SelectItem value="allow">Allow</SelectItem><SelectItem value="deny">Deny</SelectItem></SelectContent>
              </Select>
            </div>
          })}
        </div>
      </CardContent>
    </Card>
  </main>;
}
