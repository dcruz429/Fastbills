import type { Express, RequestHandler } from "express";
import { medicalRecordInputSchema } from "../shared/medical-records";
import type { IStorage } from "./storage";
import type { MedicalRecordsRepository } from "./medical-records-repository";

export function registerMedicalRecordsRoutes(app: Express, dependencies: {
  storage: Pick<IStorage, "getUser">;
  requireAuth: RequestHandler;
  repository: MedicalRecordsRepository;
  ensureHistory: () => Promise<unknown>;
}) {
  const { storage, requireAuth, repository, ensureHistory } = dependencies;
  const requireActive: RequestHandler = async (req, res, next) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.active === false) { res.status(403).json({ message: "Access denied" }); return; }
      res.locals.medicalUser = user;
      next();
    } catch { res.status(500).json({ message: "Unable to verify access" }); }
  };
  const validId = (value: unknown) => typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

  app.get("/api/medical-records", requireAuth, requireActive, async (_req, res) => {
    try {
      // One-time, transactional DATA import, never schema DDL. The persistent
      // marker prevents restart/deletion from bringing historical records back.
      await ensureHistory();
      res.json(await repository.list());
    } catch { res.status(500).json({ message: "Unable to load medical records requests. Please retry or contact your administrator." }); }
  });

  function save(edit: boolean): RequestHandler {
    return async (req, res) => {
      try {
        const id = edit ? validId(req.params.id) : undefined;
        if (edit && id === null) return res.status(400).json({ message: "Invalid request ID" });
        const existing = edit ? await repository.get(id!) : undefined;
        if (edit && !existing) return res.status(404).json({ message: "Request not found" });
        const parsed = medicalRecordInputSchema.safeParse(req.body);
        // Do not echo validation payloads containing patient/contact details.
        if (!parsed.success) return res.status(400).json({ message: "Invalid request fields. Select a tab and status; text fields must be 20,000 characters or fewer." });
        if (!parsed.data.patientName.trim() && (!existing || existing.patientName.trim())) {
          return res.status(400).json({ message: "Patient name is required" });
        }
        if (!await repository.getTab(parsed.data.tabId)) return res.status(400).json({ message: "Select an existing clinic tab" });
        const row = await repository.save(parsed.data, req.session.userId!, id ?? undefined);
        if (!row) return res.status(404).json({ message: "Request not found" });
        res.status(edit ? 200 : 201).json(row);
      } catch { res.status(500).json({ message: "Unable to save request. Your changes have not been confirmed; please retry." }); }
    };
  }
  app.post("/api/medical-records", requireAuth, requireActive, save(false));
  app.patch("/api/medical-records/:id", requireAuth, requireActive, save(true));
  app.delete("/api/medical-records/:id", requireAuth, requireActive, async (req, res) => {
    if (res.locals.medicalUser.role !== "admin") return res.status(403).json({ message: "Only admins can delete requests" });
    const id = validId(req.params.id);
    if (id === null) return res.status(400).json({ message: "Invalid request ID" });
    try {
      if (!await repository.delete(id)) return res.status(404).json({ message: "Request not found" });
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Unable to delete request" }); }
  });
}
