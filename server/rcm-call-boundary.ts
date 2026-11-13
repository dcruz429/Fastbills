import type { RequestHandler } from "express";
import { permissionAllowed, resourceAllowed, type AccessContext } from "../shared/rcm-access-policy";
import type { storage } from "./storage";
import type { ResolvedAccess } from "./rcm-access-service";
import { CALL_SCOPE_DEPARTMENTS } from "../shared/call-calendar-contract";
import { supervisedEmployeesSchema, type SupervisedEmployee } from "./rcm-call-supervision";

// Runtime dependencies are injected: importing this module never opens a DB.
type CallStorage = Pick<typeof storage,
  "getScheduledCall" | "getPatientScheduleEntry" | "getPatientScheduleEntryByCallId" |
  "getTask" | "getCollection" | "getDenial" | "getArbitration" | "getPosting" | "getCheck" | "getClosed">;
type Permission = "tasks.read" | "tasks.update";
type ScopedRow = { clinic?: string | null; department?: string | null };
export interface CallAuthorization {
  targetUserId?: number;
  canReadEmployee(userId: number): boolean;
  canReadSchedule(row: any): Promise<boolean>;
  canScope(row: ScopedRow, permission?: Permission): boolean;
  canCall(row: ScopedRow & { assignedUserId?: number | null }, permission?: Permission): boolean;
  canAudit(row: { userId: number; sourceId: number; department: string }): Promise<boolean>;
}

export function positiveCallId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function createCallBoundary(deps: {
  storage: CallStorage;
  resolveAccess(userId: number): Promise<ResolvedAccess | null>;
  clinicIds(): Promise<Map<string, number>>;
  supervisedEmployees?(userId: number): Promise<SupervisedEmployee[]>;
}): RequestHandler {
  return async (req, res, next) => {
    const userId = req.session.userId;
    if (!userId) return void res.status(401).json({ message: "Not authenticated" });
    try {
      const access = await deps.resolveAccess(userId);
      if (!access) return void res.status(403).json({ message: "Access denied" });
      const context: AccessContext = access.context;
      const read = req.method === "GET" || req.method === "HEAD";
      if (!read && req.session.originalUserId)
        return void res.status(403).json({ message: "Calls cannot be modified during impersonation" });
      const permission: Permission = read ? "tasks.read" : "tasks.update";
      // Only explicit backend grants authorize supervision. Neither roles,
      // ordinary membership, team names nor request parameters create grants.
      const employees = read && !req.session.originalUserId &&
        permissionAllowed(context, "tasks.read") && context.clinicIds.size > 0 &&
        context.departmentIds.size > 0 && deps.supervisedEmployees
        ? supervisedEmployeesSchema.parse(await deps.supervisedEmployees(userId)) : [];
      const employeeIds = new Set(employees.map(employee => employee.id));
      // Self-only, data-free capability projection. No role defaults are
      // guessed by the client, and explicit denies apply even to admins.
      if (read && req.path.replace(/\/+$/, "").toLowerCase() === "/capabilities") {
        const clinics = await deps.clinicIds();
        const canRead = permissionAllowed(context, "tasks.read");
        return void res.json({
          userId, canRead,
          canMutate: canRead && !req.session.originalUserId && permissionAllowed(context, "tasks.update"),
          canManage: canRead && context.isSystemAdmin,
          supervisedEmployees: employees,
          clinics: canRead ? Array.from(clinics, ([name, id]) => ({ name, id }))
            .filter(row => context.isSystemAdmin || context.clinicIds.has(row.id)) : [],
          departments: canRead ? CALL_SCOPE_DEPARTMENTS.filter(d => context.isSystemAdmin || context.departmentIds.has(d)) : [],
        });
      }
      if (!permissionAllowed(context, permission))
        return void res.status(403).json({ message: "RCM call permission required" });
      if (req.path.includes("%"))
        return void res.status(400).json({ message: "Encoded call paths are not supported" });
      // Match Express's case-insensitive, optional-trailing-slash routing.
      const suffix = req.path.replace(/\/+$/, "").toLowerCase() || "/";
      const record = /^\/([^/]+)(?:\/(start|cancel|attempts|activity))?$/.exec(suffix);
      const schedule = /^\/daily-schedule\/([^/]+)\/(status|notes|ensure-call)$/.exec(suffix);
      const collection = suffix === "/";
      const report = suffix === "/stats" || suffix === "/agent-stats";
      const daily = suffix === "/daily-schedule";
      const audit = suffix === "/rollover-audit";
      const recordMatch = !report && !daily && !audit && record;
      const validMethod = collection ? read || req.method === "POST"
        : report || daily || audit ? read
        : schedule ? req.method === (schedule[2] === "ensure-call" ? "POST" : "PATCH")
        : recordMatch ? !recordMatch[2] ? read || req.method === "PATCH"
          : recordMatch[2] === "activity" ? read
          : recordMatch[2] === "attempts" ? read || req.method === "POST"
          : req.method === "POST"
        : false;
      if (!validMethod) return void res.status(403).json({ message: "Call route not authorized" });

      // Parse before loading records. Numeric coercion must not broaden IDs.
      const id = schedule ? positiveCallId(schedule[1]) : recordMatch ? positiveCallId(recordMatch[1]) : null;
      if ((schedule || recordMatch) && id === null)
        return void res.status(400).json({ message: "Invalid call or schedule id" });
      const clinics = await deps.clinicIds();
      const canOwn = (owner: number | null | undefined) => context.isSystemAdmin || owner === userId;
      const canScope = (row: ScopedRow, required: Permission = permission) => {
        const clinicId = typeof row.clinic === "string" ? clinics.get(row.clinic.trim().toLowerCase()) : undefined;
        return clinicId !== undefined && resourceAllowed(context, required, {
          clinicId, departmentId: row.department ?? "",
        });
      };
      const canCall = (row: ScopedRow & { assignedUserId?: number | null }, required: Permission = permission) =>
        canOwn(row.assignedUserId) ? canScope(row, required) :
          read && required === "tasks.read" && employeeIds.has(row.assignedUserId!) &&
          permissionAllowed(context, "tasks.read") &&
          // No scope bypass is introduced by a supervisory grant.
          context.clinicIds.has(clinics.get(row.clinic?.trim().toLowerCase() ?? "")!) &&
          context.departmentIds.has(row.department ?? "");
      const canSchedule = async (row: Awaited<ReturnType<CallStorage["getPatientScheduleEntry"]>>) => {
        if (!row || !canCall({ ...row, assignedUserId: row.userId })) return false;
        if (row.callId != null) {
          const linked = await deps.storage.getScheduledCall(row.callId);
          if (!linked || !canCall(linked)) return false;
          if (!canOwn(row.userId) && linked.assignedUserId !== row.userId) return false;
        }
        return true;
      };
      const auth: CallAuthorization = {
        canScope, canCall, canReadSchedule: canSchedule,
        canReadEmployee: owner => canOwn(owner) || (read && employeeIds.has(owner)),
        async canAudit(row) {
          if (!canOwn(row.userId) || !Number.isSafeInteger(row.sourceId) || row.sourceId <= 0) return false;
          if (row.department === "Verification" || row.department === "Billing") {
            const task = await deps.storage.getTask(row.sourceId);
            const departmentId = task?.bucket === "for_verification" ? "Verification"
              : task?.bucket === "ready_for_billing" ? "Billing" : null;
            return !!task && departmentId === row.department &&
              resourceAllowed(context, "tasks.read", { clinicId: task.clinicId!, departmentId }) &&
              task.clinicId != null;
          }
          const loaders = {
            Collections: deps.storage.getCollection.bind(deps.storage),
            Denials: deps.storage.getDenial.bind(deps.storage),
            Arbitration: deps.storage.getArbitration.bind(deps.storage),
            Posting: deps.storage.getPosting.bind(deps.storage),
            Checks: deps.storage.getCheck.bind(deps.storage),
            RTP: deps.storage.getClosed.bind(deps.storage),
          };
          const loader = loaders[row.department as keyof typeof loaders];
          if (!Object.hasOwn(loaders, row.department) || !loader) return false;
          const source = await loader(row.sourceId);
          return !!source && canScope({ clinic: source.clinic, department: row.department }, "tasks.read");
        },
      };
      res.locals.callAuthorization = auth;
      if (report) {
        if (!context.isSystemAdmin)
          return void res.status(403).json({ message: "Aggregate call reports require system administrator access" });
      } else if (daily || audit) {
        const requested = req.query.userId;
        if (requested !== undefined) {
          const target = positiveCallId(requested);
          if (target === null) return void res.status(400).json({ message: "Invalid user id" });
          if (!canOwn(target) && !(daily && read && employeeIds.has(target)))
            return void res.status(403).json({ message: "Call ownership or explicit supervision required" });
          auth.targetUserId = target;
        } else {
          auth.targetUserId = audit && context.isSystemAdmin ? undefined : userId;
        }
      } else if (schedule) {
        const row = await deps.storage.getPatientScheduleEntry(id!);
        if (!await canSchedule(row))
          return void res.status(404).json({ message: "Schedule entry not found" });
      } else if (recordMatch) {
        const call = await deps.storage.getScheduledCall(id!);
        if (!call || !canCall(call))
          return void res.status(404).json({ message: "Call not found" });
        if (!read) {
          // Attempts also synchronize a linked schedule entry's status.
          const linked = await deps.storage.getPatientScheduleEntryByCallId(id!);
          if (linked && (linked.callId !== id || !await canSchedule(linked)))
            return void res.status(404).json({ message: "Call not found" });
        }
        if (req.method === "POST" && recordMatch[2] === "attempts" &&
            (req.body?.updateTaskStatus || req.body?.newTaskStatus))
          return void res.status(403).json({ message: "Use the authorized RCM task workflow" });
        if (req.method === "PATCH" &&
            ["relatedTaskId", "assignedUserId", "clinic", "department"].some(k => Object.hasOwn(req.body ?? {}, k)))
          return void res.status(403).json({ message: "Call scope and assignment changes require a dedicated workflow" });
        if (req.method === "POST" && recordMatch[2] === "attempts" &&
            req.body?.nextAssignedUserId != null && Number(req.body.nextAssignedUserId) !== userId)
          return void res.status(403).json({ message: "Follow-up assignment requires a dedicated workflow" });
      } else if (collection && !read) {
        if (req.body?.relatedTaskId != null ||
            (req.body?.assignedUserId != null && Number(req.body.assignedUserId) !== userId))
          return void res.status(403).json({ message: "Task linking and assignment require a dedicated workflow" });
        if (!canScope(req.body ?? {}))
          return void res.status(403).json({ message: "Call clinic and department scope required" });
      }
      next();
    } catch (error) { next(error); }
  };
}
