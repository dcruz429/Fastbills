import type { RequestHandler } from "express";

export function isPaidOnlyUpdate(data: Record<string, unknown>): boolean {
  return Object.keys(data).length === 1 && typeof data.paid === "boolean";
}

// Paid is a separate, reversible marker; it never implies a status/outcome.
export const validatePaidFlag: RequestHandler = (req, res, next) => {
  if (req.body?.paid !== undefined && typeof req.body.paid !== "boolean") {
    return void res.status(400).json({ message: "PAID must be checked or unchecked (true or false)." });
  }
  next();
};
