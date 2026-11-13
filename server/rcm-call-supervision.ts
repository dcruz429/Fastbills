/**
 * Injected persistence only: importing this module never opens a database.
 * No caching: grant, membership and scope revocations apply on the next request.
 */
import type { Pool } from "pg";
import { z } from "zod";

export const supervisedEmployeesSchema = z.array(z.object({
  id: z.number().int().positive().safe(), fullName: z.string().min(1),
}).strict()).max(10000).refine(rows => new Set(rows.map(row => row.id)).size === rows.length,
  "Ambiguous employee membership");
export type SupervisedEmployee = z.infer<typeof supervisedEmployeesSchema>[number];
export interface CallSupervisionStore {
  employees(userId: number): Promise<SupervisedEmployee[]>;
  configuration(userId: number): Promise<{ teamIds: number[]; teams: { id: number; name: string }[] }>;
  replace(userId: number, teamIds: number[], actorId: number): Promise<void>;
}
export class SupervisionConfigurationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function createCallSupervisionStore(db: Pick<Pool, "query" | "connect">): CallSupervisionStore {
  return {
    async employees(userId) {
      try {
        const result = await db.query(`
          SELECT DISTINCT member.id, member.full_name AS "fullName"
          FROM rcm_call_supervisors grant_row
          JOIN teams t ON t.id=grant_row.team_id
          JOIN users supervisor ON supervisor.id=grant_row.manager_user_id AND supervisor.active=true
          JOIN users grantor ON grantor.id=grant_row.granted_by AND grantor.active=true AND grantor.role='admin'
          JOIN user_teams membership ON membership.team_id=t.id
          JOIN users member ON member.id=membership.user_id AND member.active=true
          WHERE grant_row.manager_user_id=$1 AND member.id<>$1
          ORDER BY member.id`, [userId]);
        return supervisedEmployeesSchema.parse(result.rows);
      } catch (error: any) {
        // Deployment without the explicitly approved schema remains self-only.
        if (error?.code === "42P01") return [];
        throw error;
      }
    },
    async configuration(userId) {
      const [grants, teams] = await Promise.all([
        db.query("SELECT team_id FROM rcm_call_supervisors WHERE manager_user_id=$1 ORDER BY team_id", [userId]),
        db.query("SELECT id, name FROM teams ORDER BY name"),
      ]);
      return { teamIds: grants.rows.map(row => row.team_id), teams: teams.rows };
    },
    async replace(userId, teamIds, actorId) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        // Serialize replacements/revocations for this supervisor.
        const user = await client.query("SELECT id, active FROM users WHERE id=$1 FOR UPDATE", [userId]);
        if (user.rowCount !== 1 || !user.rows[0].active)
          throw new SupervisionConfigurationError(404, "Active employee not found");
        // Recheck the grantor's trusted identity inside the transaction too.
        const actor = await client.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND active=true FOR SHARE", [actorId]);
        if (actor.rowCount !== 1) throw new SupervisionConfigurationError(403, "System administrator required");
        const known = await client.query("SELECT id FROM teams WHERE id=ANY($1::int[]) FOR SHARE", [teamIds]);
        if (known.rowCount !== teamIds.length) throw new SupervisionConfigurationError(400, "Unknown or duplicate team");
        const before = await client.query("SELECT team_id FROM rcm_call_supervisors WHERE manager_user_id=$1", [userId]);
        await client.query("DELETE FROM rcm_call_supervisors WHERE manager_user_id=$1", [userId]);
        for (const teamId of teamIds) await client.query(
          "INSERT INTO rcm_call_supervisors(manager_user_id,team_id,granted_by) VALUES($1,$2,$3)", [userId, teamId, actorId]);
        await client.query(
          "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",
          [actorId, userId, "call_supervision_replaced", JSON.stringify({ before: before.rows.map(r => r.team_id), after: teamIds })]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
  };
}
