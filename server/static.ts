import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { staticCacheControl } from "./static-cache";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => res.setHeader("Cache-Control", staticCacheControl(filePath)),
  }));

  // A missing chunk must not receive HTML from the SPA fallback.
  app.use("/assets", (_req, res) => res.status(404).set("Cache-Control", "no-cache").end());

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
