/**
 * Read-only RCM Task Board preview using the EXISTING FastbillsPH tasks table.
 * Only Verification/Billing tasks are mapped in this first integration slice.
 * Other RCM tracker sources require separate schema-specific adapters.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { resolveRcmAccess } from "./rcm-access-service";
import { permissionAllowed } from "../shared/rcm-access-policy";

const TASK_BUCKETS = ["for_verification", "ready_for_billing", "done"] as const;

export function registerRcmTaskboardRoutes(app: Express) {
  app.get("/api/rcm/taskboard", async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const access = await resolveRcmAccess(req.session.userId);
      if (!access || !permissionAllowed(access.context, "tasks.read")) {
        return res.status(403).json({ message: "RCM task access denied" });
      }
      const isAdmin = access.context.isSystemAdmin;
      const departments = [...access.context.departmentIds].filter(x => x === "Verification" || x === "Billing");
      const clinicIds = [...access.context.clinicIds];
      if (!isAdmin && (departments.length === 0 || clinicIds.length === 0)) {
        return res.json({ tasks: [], total: 0, limitedTo: "Verification and Billing" });
      }
      const rawPage = Number(req.query.page ?? 1);
      const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
      const limit = 100;
      const offset = (page - 1) * limit;
      const statement = `
        SELECT t.id, t.patient_name AS "patientName", t.bucket,
          CASE WHEN t.bucket = 'for_verification' THEN 'Verification' ELSE 'Billing' END AS department,
          t.status, t.priority, t.created_at AS "createdAt", t.due_date AS "dueDate",
          t.clinic_id AS "clinicId", c.name AS "clinicName",
          t.assigned_user_id AS "assignedUserId", u.full_name AS "assigneeName"
        FROM tasks t
        LEFT JOIN clinics c ON c.id = t.clinic_id
        LEFT JOIN users u ON u.id = t.assigned_user_id
        WHERE t.bucket IN ('for_verification', 'ready_for_billing', 'done')
          AND ($1::boolean OR (
            t.clinic_id = ANY($2::int[])
            AND (CASE WHEN t.bucket = 'for_verification' THEN 'Verification' ELSE 'Billing' END) = ANY($3::text[])
          ))
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $4 OFFSET $5
      `;
      const rows = await pool.query(statement, [isAdmin, clinicIds, departments, limit, offset]);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ tasks: rows.rows, page, pageSize: limit, limitedTo: "Verification and Billing" });
    } catch (error) { next(error); }
  });
}
