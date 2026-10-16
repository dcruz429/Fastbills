import type { Express, RequestHandler } from "express";
import type { IStorage } from "./storage";
import { guidelineModuleContentSchema } from "../shared/schema";
import { canEditGuidelineModules } from "../shared/guideline-permissions";

type Dependencies = {
  storage: Pick<IStorage, "getUser" | "updateUser" | "getAllGuidelineModules" | "getGuidelineModule" | "createGuidelineModule" | "updateGuidelineModule" | "getDropdownOptionsByCategory">;
  requireAuth: RequestHandler;
  upload: { array: (name: string, maxCount?: number) => RequestHandler };
  saveUploadedFiles: (files: Express.Multer.File[]) => Promise<string[]>;
};

const safeExtensions = /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|csv|txt)$/i;
const safeMimeTypes = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "text/csv",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

export function registerGuidelineBoardRoutes(app: Express, { storage, requireAuth, upload, saveUploadedFiles }: Dependencies) {
  const parseAttachments = upload.array("attachments", 10);
  const receiveAttachments: RequestHandler = (req, res, next) => {
    parseAttachments(req, res, error => {
      if (error) {
        res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          message: error.code === "LIMIT_FILE_SIZE" ? "Attachments must be 10 MB or smaller" : "Unable to upload attachments. Use at most 10 files.",
        });
        return;
      }
      next();
    });
  };
  const requireModuleEditor: RequestHandler = async (req, res, next) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!canEditGuidelineModules(user)) {
        res.status(403).json({ message: "Module editor access is required to create or edit guideline modules" });
        return;
      }
      next();
    } catch {
      res.status(500).json({ message: "Unable to verify module permissions" });
    }
  };

  app.patch("/api/users/:id/guideline-module-access", requireAuth, async (req, res) => {
    try {
      const admin = await storage.getUser(req.session.userId!);
      if (!admin || admin.active === false || admin.role !== "admin") {
        return res.status(403).json({ message: "Only admins can manage module editor access" });
      }
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid user ID" });
      if (typeof req.body?.guidelineModuleAccess !== "boolean") {
        return res.status(400).json({ message: "Module editor access must be true or false" });
      }
      const target = await storage.getUser(id);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "admin") return res.status(400).json({ message: "Admins always have module editor access" });
      const updated = await storage.updateUser(id, { guidelineModuleAccess: req.body.guidelineModuleAccess });
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch {
      res.status(500).json({ message: "Unable to update module editor access" });
    }
  });

  app.get("/api/guideline-modules", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.active === false) return res.status(403).json({ message: "Access denied" });
      res.json(await storage.getAllGuidelineModules());
    } catch {
      res.status(500).json({ message: "Unable to load guideline modules" });
    }
  });

  function save(edit: boolean): RequestHandler {
    return async (req, res) => {
      try {
        const parsed = guidelineModuleContentSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid module content" });
        const id = edit ? Number(req.params.id) : null;
        if (edit && (!Number.isSafeInteger(id) || id! <= 0)) return res.status(400).json({ message: "Invalid module ID" });
        const existing = edit ? await storage.getGuidelineModule(id!) : undefined;
        if (edit && !existing) return res.status(404).json({ message: "Module not found" });
        const types = await storage.getDropdownOptionsByCategory("guideline_module_type");
        if (parsed.data.moduleType !== existing?.moduleType && !types.some(option => option.value === parsed.data.moduleType)) {
          return res.status(400).json({ message: "Select a module type configured in Admin Settings → Dropdowns" });
        }
        let retained = existing?.attachments || [];
        if (edit && req.body.retainedAttachments !== undefined) {
          try {
            const requested = typeof req.body.retainedAttachments === "string" ? JSON.parse(req.body.retainedAttachments) : req.body.retainedAttachments;
            if (!Array.isArray(requested) || requested.some(value => typeof value !== "string" || !retained.includes(value))) {
              return res.status(400).json({ message: "Invalid retained attachments" });
            }
            retained = Array.from(new Set<string>(requested));
          } catch {
            return res.status(400).json({ message: "Invalid retained attachments" });
          }
        }
        const files = (req.files || []) as Express.Multer.File[];
        if (retained.length + files.length > 10) return res.status(400).json({ message: "A module can have at most 10 attachments" });
        if (files.some(file => !safeExtensions.test(file.originalname) || !safeMimeTypes.has(file.mimetype))) {
          return res.status(400).json({ message: "Unsupported attachment type. Use images, PDF, Word, Excel, CSV or text files." });
        }
        const uploaded = files.length ? await saveUploadedFiles(files) : [];
        const content = { ...parsed.data, attachments: [...retained, ...uploaded], updatedById: req.session.userId! };
        const module = edit
          ? await storage.updateGuidelineModule(id!, content)
          : await storage.createGuidelineModule({ ...content, authorId: req.session.userId! });
        if (!module) return res.status(404).json({ message: "Module not found" });
        res.status(edit ? 200 : 201).json(module);
      } catch {
        res.status(500).json({ message: "Unable to save module. Your changes have not been confirmed; please try again." });
      }
    };
  }

  app.post("/api/guideline-modules", requireAuth, requireModuleEditor, receiveAttachments, save(false));
  app.patch("/api/guideline-modules/:id", requireAuth, requireModuleEditor, receiveAttachments, save(true));
}
