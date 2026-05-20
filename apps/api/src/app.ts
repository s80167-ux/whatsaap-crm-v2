import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { publicEmailRoutes } from "./modules/emailCampaigns/publicEmail.routes.js";
import { apiRouter } from "./routes/index.js";
import { socialWebhooksRoutes } from "./modules/socialWebhooks/socialWebhooks.routes.js";

export const app = express();

app.set("etag", false);

if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

function isLocalOrigin(origin: string) {
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

function isProjectVercelOrigin(origin: string) {
  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === "https:" &&
      parsedOrigin.hostname.endsWith(".vercel.app") &&
      /^whats(?:app|aap)-crm-v2-/i.test(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) {
    return true;
  }

  if (origin === env.FRONTEND_URL) {
    return true;
  }

  if (env.NODE_ENV !== "production") {
    return isLocalOrigin(origin);
  }

  if (isProjectVercelOrigin(origin)) {
    return true;
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
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    exposedHeaders: ["Content-Disposition", "X-Export-Row-Count"]
  })
);
app.use(requestContext);
app.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  next();
});
app.use(cookieParser());
app.use(express.json({
  limit: "8mb",
  verify(request, _response, buffer) {
    (request as express.Request).rawBody = Buffer.from(buffer);
  }
}));
app.use(morgan("dev"));

app.use(publicEmailRoutes);
app.use("/api/social-webhook", socialWebhooksRoutes);
app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
