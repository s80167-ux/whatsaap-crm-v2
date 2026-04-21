import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { router } from "./routes/index.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

app.use("/", router);

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
