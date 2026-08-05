import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { seed } = await import("./seed");
  await seed().catch((e) => console.error("Seed error:", e));

  const { backfillDoneActivities, backfillDueDates } = await import("./backfill");
  await backfillDoneActivities().catch((e) => console.error("Backfill error:", e));
  await backfillDueDates().catch((e) => console.error("Backfill due dates error:", e));

  // ── Self-healing: remove stale/corrupt schedule rows ──
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");

    // 1. Remove rows from departments that are no longer included in the call calendar
    //    (only Verification and Collections are valid sources now)
    const stale = await db.execute(sql`
      DELETE FROM patient_call_schedule
      WHERE department NOT IN ('Verification', 'Collections')
      RETURNING id
    `);
    if (stale.rows.length > 0) {
      log(`Removed ${stale.rows.length} stale schedule row(s) (non-Verification/Collections departments)`);
    }

    // 2. Remove rows scheduled before today — the calendar start date is always "today",
    //    so past-dated rows are orphaned and prevent the first-ever build from re-running
    const todayNY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const past = await db.execute(sql`
      DELETE FROM patient_call_schedule
      WHERE scheduled_date < ${todayNY}
      RETURNING id
    `);
    if (past.rows.length > 0) {
      log(`Removed ${past.rows.length} past schedule row(s) (before today ${todayNY})`);
    }

    // 3. Remove days where a user has > 40 rows (race-condition duplicates) so they rebuild cleanly
    const corrupt = await db.execute(sql`
      SELECT user_id, scheduled_date
      FROM patient_call_schedule
      GROUP BY user_id, scheduled_date
      HAVING COUNT(*) > 40
    `);
    if (corrupt.rows.length > 0) {
      for (const row of corrupt.rows as any[]) {
        await db.execute(sql`
          DELETE FROM patient_call_schedule
          WHERE user_id = ${row.user_id} AND scheduled_date = ${row.scheduled_date}
        `);
      }
      log(`Cleaned up ${corrupt.rows.length} corrupt schedule day(s) (race-condition duplicates)`);
    }
  } catch (e) {
    console.error("Schedule cleanup error:", e);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
