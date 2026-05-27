import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { router } from "./routes/index.js";
import { contactIdentityResolverRouter } from "./routes/contactIdentityResolverRoutes.js";

export const app = express();

if (process.env.NODE_ENV === "development") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          connectSrc: ["'self'", "http://localhost:4000", "ws://localhost:4000"],
        },
      },
    })
  );
} else {
  app.use(helmet());
}
app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

app.use("/", contactIdentityResolverRouter);
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
