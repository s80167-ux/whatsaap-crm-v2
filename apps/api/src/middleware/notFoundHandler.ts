import type { Request, Response } from "express";

export function notFoundHandler(request: Request, response: Response) {
  return response.status(404).json({
    error: "Route not found",
    requestId: request.requestId ?? null
  });
}
