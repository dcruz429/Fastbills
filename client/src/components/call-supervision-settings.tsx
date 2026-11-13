import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const ids = z.array(z.number().int().positive().safe());
const configSchema = z.object({
  teamIds: ids, teams: z.array(z.object({ id: z.number().int().positive().safe(), name: z.string() })),
});
async function request<T>(url: string, schema: z.ZodType<T>, teamIds?: number[]): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin", method: teamIds ? "PUT" : "GET",
    ...(teamIds ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamIds }) } : {}),
  });
  let data: any;
  try { data = await res.json(); } catch { throw new Error("Invalid supervision configuration response"); }
  if (!res.ok) throw new Error(typeof data?.message === "string" ? data.message : "Supervision configuration unavailable");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("Invalid supervision configuration response");
  return parsed.data;
}

/** Part of existing RCM permission configuration. All authority is server-side. */
export function CallSupervisionSettings({ userId }: { userId: number }) {
  const { user, isImpersonating } = useAuth();
  const client = useQueryClient();
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [notice, setNotice] = useState("");
  const url = `/api/rcm/access/call-supervision/${userId}`;
  const enabled = user?.role === "admin" && !isImpersonating;
  const query = useQuery({
    queryKey: [url], queryFn: () => request(url, configSchema), retry: false, enabled,
  });
  useEffect(() => { setTeamIds(query.data?.teamIds ?? []); }, [userId, query.data]);
  useEffect(() => { setNotice(""); }, [userId]);
  const mutation = useMutation({
    mutationFn: (selected: number[]) => request(url, z.object({ teamIds: ids }), selected),
    onSuccess: async () => {
      setNotice("Supervisory assignments saved. Revocations apply on the next protected request.");
      await Promise.all([
        client.invalidateQueries({ queryKey: [url] }),
        client.invalidateQueries({ queryKey: ["/api/calls/capabilities"] }),
        client.invalidateQueries({ queryKey: ["/api/calls"] }),
      ]);
    },
  });
  const disabled = !enabled || !query.data || !!query.error || mutation.isPending;
  return <Card data-testid="call-supervision-settings">
    <CardHeader><CardTitle className="text-base">Call Calendar supervisory teams</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">No supervision is granted by default. Explicitly assigned teams permit viewing only, within the supervisor’s clinic and department access. Team membership and manager roles alone grant nothing. Reports, edits, task changes and delegation are not included.</p>
      {!enabled && <p role="alert">Stop impersonation and use an authorized system administrator account.</p>}
      {(query.error || mutation.error) && <p role="alert" className="text-sm text-destructive">
        {(query.error || mutation.error)?.message}
      </p>}
      {query.isLoading && <p>Loading supervisory assignments…</p>}
      {query.data?.teams.map(team => <label key={team.id} className="flex gap-3 items-center text-sm">
        <Checkbox aria-label={`Supervise ${team.name}`} checked={teamIds.includes(team.id)} disabled={disabled}
          onCheckedChange={checked => { setNotice(""); setTeamIds(old => checked === true ? [...new Set([...old, team.id])] : old.filter(id => id !== team.id)); }} />
        {team.name}
      </label>)}
      {query.data && !query.data.teams.length && <p>No teams have been configured.</p>}
      <div className="flex gap-2">
        <Button disabled={disabled} onClick={() => mutation.mutate(teamIds)}>Save supervisory teams</Button>
        <Button variant="outline" disabled={disabled} onClick={() => mutation.mutate([])}>Revoke all supervisory teams</Button>
      </div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </CardContent>
  </Card>;
}
