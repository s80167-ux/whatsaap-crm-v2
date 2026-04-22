import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (origin === env.FRONTEND_URL) {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    try {
      const parsedOrigin = new URL(origin);
      return (
        parsedOrigin.protocol === "http:" &&
        (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1")
      );
    } catch {
      return false;
    }
  }

  return false;
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin ?? "unknown"}`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/api", apiRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.flatten()
    });
  }

  return res.status(500).json({
    error: error instanceof Error ? error.message : "Internal server error"
  });
});
