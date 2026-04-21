import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export function requireInternalSecret(request: Request, response: Response, next: NextFunction) {
  const secret = request.header("x-connector-secret");

  if (!secret || secret !== env.CONNECTOR_INTERNAL_SECRET) {
    return response.status(401).json({ error: "Invalid connector secret" });
  }

  return next();
}
