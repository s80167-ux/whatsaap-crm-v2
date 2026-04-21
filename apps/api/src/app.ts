import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { requestContext } from "./middleware/requestContext.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true
  })
);
app.use(requestContext);
app.use(express.json({ limit: "8mb" }));
app.use(morgan("dev"));

app.use("/api", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
