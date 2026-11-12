/**
 * Phase 1 scoped RCM administration API.
 * Additive to existing sessions and user records. Requires SQL migration.
 * Legacy tracker authorization remains unchanged until later integration phases.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "./db";
import { RCM_PERMISSIONS, RCM_ROLE_DEFAULTS, type RcmPermission } from "../shared/rcm-access-policy";

const DEPARTMENTS = ["Document Center", "Verification", "Billing", "Posting", "Collections", "Denials", "Arbitration", "Case Management / RTP", "Checks", "Closed"] as const;
const MANAGE_ROLES = new Set(["admin"]);
const idSchema = z.coerce.number().int().positive();
const roleSlugSchema = z.string().regex(/^[a-z][a-z0-9_]{1,49}$/);
const assignmentSchema = z.object({
  departments: z.array(z.enum(DEPARTMENTS)).max(DEPARTMENTS.length),
  clinicIds: z.array(z.number().int().positive()).max(500),
  extraRoles: z.array(roleSlugSchema).max(20).optional(),
});
const overrideSchema = z.object({ permission: z.enum(RCM_PERMISSIONS), effect: z.enum(["allow", "deny"]).nullable() });
const rolePermissionSchema = z.object({ role: roleSlugSchema, permission: z.enum(RCM_PERMISSIONS), effect: z.enum(["allow", "deny"]).nullable() });
const customRoleSchema = z.object({ slug: roleSlugSchema, label: z.string().trim().min(2).max(100) });

async function onlyAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
  // Impersonation cannot be used to change grants, even while presenting as another user.
  if (req.session.originalUserId) return res.status(403).json({ message: "Stop impersonation to manage permissions" });
  try {
    const row = await pool.query("SELECT id, role, active FROM users WHERE id = $1", [req.session.userId]);
    if (row.rowCount !== 1 || !row.rows[0].active || !MANAGE_ROLES.has(row.rows[0].role)) {
      return res.status(403).json({ message: "System administrator required" });
    }
    next();
  } catch (error) { next(error); }
}

export function registerRcmAccessRoutes(app: Express) {
  app.get("/api/rcm/access/catalog", onlyAdmin, async (_req, res, next) => {
    try {
      const [clinics, roles] = await Promise.all([pool.query("SELECT id, name FROM clinics ORDER BY name"), pool.query("SELECT slug, label, is_system FROM rcm_roles ORDER BY label")]);
      res.json({ departments: DEPARTMENTS, permissions: RCM_PERMISSIONS, defaults: RCM_ROLE_DEFAULTS, clinics: clinics.rows, roles: roles.rows });
    } catch (error) { next(error); }
  });

  app.get("/api/rcm/access/users/:userId", onlyAdmin, async (req, res, next) => {
    try {
      const userId = idSchema.parse(req.params.userId);
      const user = await pool.query("SELECT id, username, full_name, role, active FROM users WHERE id=$1", [userId]);
      if (!user.rowCount) return res.status(404).json({ message: "User not found" });
      const [departments, clinics, overrides, extraRoles] = await Promise.all([
        pool.query("SELECT department_key FROM rcm_user_departments WHERE user_id=$1 ORDER BY department_key", [userId]),
        pool.query("SELECT clinic_id FROM rcm_user_clinics WHERE user_id=$1 ORDER BY clinic_id", [userId]),
        pool.query("SELECT permission_key, effect FROM rcm_user_permission_overrides WHERE user_id=$1 ORDER BY permission_key", [userId]),
        pool.query("SELECT role_slug FROM rcm_user_roles WHERE user_id=$1 ORDER BY role_slug", [userId]),
      ]);
      res.json({
        user: user.rows[0],
        departments: departments.rows.map(x=>x.department_key),
        clinicIds: clinics.rows.map(x=>x.clinic_id),
        overrides: Object.fromEntries(overrides.rows.map(x=>[x.permission_key,x.effect])),
        extraRoles: extraRoles.rows.map(x=>x.role_slug),
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid user ID" });
      next(error);
    }
  });

  app.put("/api/rcm/access/users/:userId/scopes", onlyAdmin, async (req, res, next) => {
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid scopes", errors: parsed.error.flatten() });
    let userId: number;
    try { userId = idSchema.parse(req.params.userId); } catch { return res.status(400).json({ message: "Invalid user ID" }); }
    const { departments, clinicIds, extraRoles } = parsed.data;
    if (departments.length !== new Set(departments).size || clinicIds.length !== new Set(clinicIds).size || (extraRoles && extraRoles.length !== new Set(extraRoles).size)) {
      return res.status(400).json({ message: "Duplicate assignments" });
    }
    if (userId === req.session.userId) return res.status(403).json({ message: "Cannot change own scope" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT id, role FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "User not found" }); }
      if (target.rows[0].role === "admin") { await client.query("ROLLBACK"); return res.status(403).json({ message: "Admin scope is protected" }); }
      const valid = await client.query("SELECT id FROM clinics WHERE id = ANY($1::int[])", [clinicIds]);
      if (valid.rowCount !== clinicIds.length) { await client.query("ROLLBACK"); return res.status(400).json({ message: "One or more clinics do not exist" }); }
      if (extraRoles) {
        const roles = await client.query("SELECT slug FROM rcm_roles WHERE slug = ANY($1::text[]) AND is_system = false", [extraRoles]);
        if (roles.rowCount !== extraRoles.length) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Unknown or protected role" }); }
      }
      await client.query("DELETE FROM rcm_user_departments WHERE user_id=$1", [userId]);
      await client.query("DELETE FROM rcm_user_clinics WHERE user_id=$1", [userId]);
      for (const department of departments) await client.query("INSERT INTO rcm_user_departments(user_id,department_key) VALUES($1,$2)", [userId,department]);
      for (const clinicId of clinicIds) await client.query("INSERT INTO rcm_user_clinics(user_id,clinic_id) VALUES($1,$2)", [userId,clinicId]);
      if (extraRoles) {
        await client.query("DELETE FROM rcm_user_roles WHERE user_id=$1", [userId]);
        for (const role of extraRoles) await client.query("INSERT INTO rcm_user_roles(user_id,role_slug) VALUES($1,$2)", [userId,role]);
      }
      await client.query(
        "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",
        [req.session.userId,userId,"scope.updated",JSON.stringify({departmentCount:departments.length,clinicIds,extraRoles:extraRoles??"unchanged"})],
      );
      await client.query("COMMIT");
      res.json({ ok: true, departments, clinicIds, extraRoles });
    } catch (error) { await client.query("ROLLBACK"); next(error); }
    finally { client.release(); }
  });

  app.put("/api/rcm/access/users/:userId/override", onlyAdmin, async (req, res, next) => {
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid permission override" });
    let userId: number;
    try { userId = idSchema.parse(req.params.userId); } catch { return res.status(400).json({ message: "Invalid user ID" }); }
    if (userId === req.session.userId) return res.status(403).json({ message: "Cannot override your own permissions" });
    const { permission, effect } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT id, role FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "User not found" }); }
      if (target.rows[0].role === "admin") { await client.query("ROLLBACK"); return res.status(403).json({ message: "Admin permissions are protected" }); }
      if (effect === null) await client.query("DELETE FROM rcm_user_permission_overrides WHERE user_id=$1 AND permission_key=$2", [userId,permission]);
      else await client.query(
        "INSERT INTO rcm_user_permission_overrides(user_id,permission_key,effect,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,permission_key) DO UPDATE SET effect=EXCLUDED.effect, updated_by=EXCLUDED.updated_by, updated_at=now()",
        [userId,permission,effect,req.session.userId],
      );
      await client.query(
        "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",
        [req.session.userId,userId,"permission.override",JSON.stringify({permission,effect})],
      );
      await client.query("COMMIT");
      res.json({ ok: true, permission, effect });
    } catch (error) { await client.query("ROLLBACK"); next(error); }
    finally { client.release(); }
  });

  app.get("/api/rcm/access/roles", onlyAdmin, async (_req, res, next) => {
    try {
      const [roles, grants] = await Promise.all([
        pool.query("SELECT slug, label, is_system FROM rcm_roles ORDER BY label"),
        pool.query("SELECT role_slug, permission_key, effect FROM rcm_role_permissions ORDER BY role_slug,permission_key"),
      ]);
      res.json({ roles: roles.rows, grants: grants.rows, defaults: RCM_ROLE_DEFAULTS, permissions: RCM_PERMISSIONS });
    } catch (error) { next(error); }
  });

  app.post("/api/rcm/access/roles", onlyAdmin, async (req, res, next) => {
    const parsed = customRoleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid custom role" });
    const { slug, label } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query(
        "INSERT INTO rcm_roles(slug,label,is_system) VALUES($1,$2,false) ON CONFLICT DO NOTHING RETURNING slug,label,is_system",
        [slug,label],
      );
      if (!created.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Role already exists" }); }
      await client.query(
        "INSERT INTO rcm_access_audit(actor_user_id,event_type,payload) VALUES($1,$2,$3::jsonb)",
        [req.session.userId,"role.created",JSON.stringify({slug,label})],
      );
      await client.query("COMMIT");
      res.status(201).json(created.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); next(error); }
    finally { client.release(); }
  });

  app.put("/api/rcm/access/roles/permission", onlyAdmin, async (req, res, next) => {
    const parsed = rolePermissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid role permission" });
    const { role, permission, effect } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT slug, is_system FROM rcm_roles WHERE slug=$1 FOR UPDATE", [role]);
      if (!found.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Unknown role" }); }
      if (found.rows[0].is_system) { await client.query("ROLLBACK"); return res.status(403).json({ message: "System role is protected" }); }
      if (effect === null) await client.query("DELETE FROM rcm_role_permissions WHERE role_slug=$1 AND permission_key=$2", [role,permission]);
      else await client.query("INSERT INTO rcm_role_permissions(role_slug,permission_key,effect) VALUES($1,$2,$3) ON CONFLICT(role_slug,permission_key) DO UPDATE SET effect=EXCLUDED.effect",[role,permission,effect]);
      await client.query("INSERT INTO rcm_access_audit(actor_user_id,event_type,payload) VALUES($1,$2,$3::jsonb)", [req.session.userId,"role.permission",JSON.stringify({role,permission,effect})]);
      await client.query("COMMIT");
      res.json({ ok:true });
    } catch(error) { await client.query("ROLLBACK"); next(error); }
    finally { client.release(); }
  });
}
