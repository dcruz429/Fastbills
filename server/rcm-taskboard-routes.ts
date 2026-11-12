/**
 * Unified RCM Task Board preview.
 *
 * Read-only projection of EXISTING FastbillsPH records. Never creates, edits,
 * reassigns or transfers any underlying tracker record.
 * Clinic lookups for legacy text-based trackers deliberately fail closed
 * unless EXACTLY ONE existing clinic matches the normalized name.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { resolveRcmAccess } from "./rcm-access-service";
import { permissionAllowed, resourceAllowed } from "../shared/rcm-access-policy";
import { taskDepartment, canAssignTaskState } from "../shared/rcm-task-assignment-policy";
import { allowedBoardDepartments } from "../shared/rcm-taskboard-scope";

const SOURCES = ["tasks", "postings", "collections", "denials", "arbitrations", "checks", "closed"] as const;

/** The record's source + original ID are stable across all views and pages. */
export type RcmTaskBoardSource = typeof SOURCES[number];

function pageNumber(raw: unknown): number {
  const value = Number(raw ?? 1);
  return Number.isSafeInteger(value) && value > 0 && value <= 10000 ? value : 1;
}

/**
 * SELECTs follow a single column order. Legacy trackers keep the source ID,
 * and are mapped into a unified read-only projection.
 *
 * Legacy tracker clinic values are TEXT. Resolve only unambiguous names;
 * unknown or ambiguous matches remain NULL, so non-admins cannot see them.
 */
export const UNIFIED_BOARD_QUERY = `
  WITH clinic_aliases AS (
    SELECT lower(btrim(name)) AS normalized_name, min(id) AS clinic_id
    FROM clinics
    GROUP BY lower(btrim(name))
    HAVING count(*) = 1
  ),
  unioned AS (
    SELECT 'tasks'::text AS source, t.id, t.patient_name AS patient_name,
      CASE WHEN t.bucket = 'for_verification' THEN 'Verification' ELSE 'Billing' END::text AS department,
      t.bucket::text AS bucket, t.status::text AS status,
      t.priority::text AS priority, t.created_at AS created_at,
      t.due_date AS due_date, t.clinic_id AS clinic_id,
      t.assigned_user_id AS assigned_user_id,
      u.full_name AS assignee_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_user_id
    WHERE t.bucket IN ('for_verification', 'ready_for_billing', 'done')
    UNION ALL
    SELECT 'postings', p.id, p.posting_patient_name, 'Posting',
      NULL, p.posting_status, p.priority, p.created_at, NULL,
      ca.clinic_id, NULL, p.assigned_to
    FROM postings p
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(p.clinic))
    UNION ALL
    SELECT 'collections', c.id, c.patient_name, 'Collections',
      NULL, c.collection_status, c.priority, c.created_at, NULL,
      ca.clinic_id, NULL, c.assigned_to
    FROM collections c
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(c.clinic))
    UNION ALL
    SELECT 'denials', d.id, d.patient_name, 'Denials',
      NULL, d.denial_status, NULL, d.created_at, NULL,
      ca.clinic_id, NULL, d.assigned_to
    FROM denials d
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(d.clinic))
    UNION ALL
    SELECT 'arbitrations', a.id, a.patient_name, 'Arbitration',
      NULL, a.arbitration_status, NULL, a.created_at, NULL,
      ca.clinic_id, NULL, a.assigned_to
    FROM arbitrations a
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(a.clinic))
    UNION ALL
    SELECT 'checks', k.id, k.check_patient_name, 'Checks',
      NULL, k.check_status, NULL, k.created_at, NULL,
      ca.clinic_id, NULL, k.assigned_to
    FROM checks k
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(k.clinic))
    UNION ALL
    SELECT 'closed', x.id, x.patient_name,
      CASE WHEN x.source ILIKE 'RTP%' THEN 'Case Management / RTP' ELSE 'Closed' END,
      NULL, x.closed_status, x.priority, x.created_at, NULL,
      ca.clinic_id, NULL, x.assigned_to
    FROM closed x
    LEFT JOIN clinic_aliases ca ON ca.normalized_name = lower(btrim(x.clinic))
  )
  SELECT v.source, v.source || ':' || v.id::text AS "itemKey", v.id,
    v.patient_name AS "patientName", v.department, v.bucket,
    v.status, v.priority, v.created_at AS "createdAt",
    v.due_date AS "dueDate", v.clinic_id AS "clinicId",
    cl.name AS "clinicName", v.assigned_user_id AS "assignedUserId",
    v.assignee_name AS "assigneeName"
  FROM unioned v
  LEFT JOIN clinics cl ON cl.id = v.clinic_id
  WHERE v.department = ANY($3::text[])
    AND ($1::boolean OR v.clinic_id = ANY($2::int[]))
    AND ($4::boolean OR v.department <> 'Checks')
  ORDER BY v.created_at DESC NULLS LAST, v.source, v.id DESC
  LIMIT $5 OFFSET $6
`;

export function registerRcmTaskboardRoutes(app: Express) {
  app.get("/api/rcm/taskboard", async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const access = await resolveRcmAccess(req.session.userId);
      if (!access || !permissionAllowed(access.context, "tasks.read")) {
        return res.status(403).json({ message: "RCM task access denied" });
      }
      const canSeeChecks = permissionAllowed(access.context, "checks.read");
      const departments = allowedBoardDepartments(access.context);
      const clinicIds = Array.from(access.context.clinicIds);
      const page = pageNumber(req.query.page);
      const limit = 100;
      const offset = (page - 1) * limit;
      res.setHeader("Cache-Control", "private, no-store");
      if (departments.length === 0 || (!access.context.isSystemAdmin && clinicIds.length === 0)) {
        return res.json({ tasks: [], page, pageSize: limit, limitedTo: "Assigned clinic and department scope", sources: SOURCES });
      }
      const rows = await pool.query(UNIFIED_BOARD_QUERY, [
        access.context.isSystemAdmin, clinicIds, departments, canSeeChecks, limit, offset,
      ]);
      const tasks = rows.rows.map(row => {
        const department = row.source === "tasks" ? taskDepartment(row.bucket) : null;
        return {
          ...row,
          canAssign: !req.session.originalUserId &&
            row.source === "tasks" && row.clinicId != null && !!department &&
            canAssignTaskState(row.bucket, row.status) &&
            resourceAllowed(access.context, "tasks.assign", {
              departmentId: department!,
              clinicId: Number(row.clinicId),
            }),
        };
      });
      res.json({ tasks, page, pageSize: limit, limitedTo: "Assigned clinic and department scope", sources: SOURCES });
    } catch (error) { next(error); }
  });
}
