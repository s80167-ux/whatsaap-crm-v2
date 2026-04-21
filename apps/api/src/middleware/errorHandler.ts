import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";
import { isAppError } from "../lib/errors.js";

export function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    logger.warn(
      {
        requestId: request.requestId,
        path: request.originalUrl,
        details: error.flatten()
      },
      "Validation failed"
    );

    return response.status(400).json({
      error: "Validation failed",
      details: error.flatten(),
      requestId: request.requestId ?? null
    });
  }

  if (isAppError(error)) {
    logger.warn(
      {
        requestId: request.requestId,
        path: request.originalUrl,
        code: error.code,
        details: error.details
      },
      error.message
    );

    return response.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details ?? null,
      requestId: request.requestId ?? null
    });
  }

  logger.error(
    {
      requestId: request.requestId,
      path: request.originalUrl,
      error
    },
    "Unhandled API error"
  );

  return response.status(500).json({
    error: error instanceof Error ? error.message : "Internal server error",
    requestId: request.requestId ?? null
  });
}
