import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { permissionAllowed } from "../shared/rcm-access-policy";
import type { ResolvedAccess } from "./rcm-access-service";
import { positiveCallId } from "./rcm-call-boundary";
import { SupervisionConfigurationError, type CallSupervisionStore } from "./rcm-call-supervision";

export function registerCallSupervisionRoutes(app: Express, deps: {
  store: CallSupervisionStore;
  resolveAccess(userId: number): Promise<ResolvedAccess | null>;
}) {
  const onlyAdmin: RequestHandler = async (req, res, next) => {
    if (!req.session.userId) return void res.status(401).json({ message: "Not authenticated" });
    if (req.session.originalUserId) return void res.status(403).json({ message: "Stop impersonation to manage supervision" });
    try {
      const access = await deps.resolveAccess(req.session.userId);
      if (!access?.context.isSystemAdmin ||
          !permissionAllowed(access.context, "scopes.manage") || !permissionAllowed(access.context, "roles.manage"))
        return void res.status(403).json({ message: "System administrator and permission-management access required" });
      next();
    } catch (error) { next(error); }
  };
  const handler = (write: boolean): RequestHandler => async (req, res, next) => {
    const userId = positiveCallId(req.params.userId);
    if (!userId) return void res.status(400).json({ message: "Invalid employee ID" });
    try {
      if (!write) return void res.json(await deps.store.configuration(userId));
      const parsed = z.object({ teamIds: z.array(z.number().int().positive().safe()).max(500) }).strict().safeParse(req.body);
      if (!parsed.success || new Set(parsed.data.teamIds).size !== parsed.data.teamIds.length)
        return void res.status(400).json({ message: "Expected unique positive team IDs" });
      await deps.store.replace(userId, parsed.data.teamIds, req.session.userId!);
      res.json({ teamIds: parsed.data.teamIds });
    } catch (error: any) {
      if (error?.code === "42P01") return void res.status(503).json({
        message: "Call supervision is not activated. An authorized schema change is required.",
      });
      if (error instanceof SupervisionConfigurationError)
        return void res.status(error.status).json({ message: error.message });
      next(error);
    }
  };
  app.get("/api/rcm/access/call-supervision/:userId", onlyAdmin, handler(false));
  // Replacement supports create/update/revoke. An empty array revokes all teams.
  app.put("/api/rcm/access/call-supervision/:userId", onlyAdmin, handler(true));
}
