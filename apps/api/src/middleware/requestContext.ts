import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger.js";

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const requestId = request.header("x-request-id") ?? crypto.randomUUID();
  request.requestId = requestId;

  response.setHeader("x-request-id", requestId);

  const startedAt = Date.now();

  logger.info(
    {
      requestId,
      method: request.method,
      path: request.originalUrl
    },
    "Request started"
  );

  response.on("finish", () => {
    logger.info(
      {
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      },
      "Request completed"
    );
  });

  next();
}
