import { Router } from "express";
import { requireAuth, requireOrganizationContext, requirePermission, requireRole } from "../middleware/authMiddleware.js";
import { adminRoutes } from "./adminRoutes.js";
import { authRoutes } from "./authRoutes.js";
import { contactRoutes } from "./contactRoutes.js";
import { conversationRoutes } from "./conversationRoutes.js";
import { dashboardRoutes } from "./dashboardRoutes.js";
import { inboxRoutes } from "./inboxRoutes.js";
import { messageRoutes } from "./messageRoutes.js";
import { platformRoutes } from "./platformRoutes.js";
import { whatsappRoutes } from "./whatsappRoutes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

apiRouter.use("/auth", authRoutes);

apiRouter.use(requireAuth);

apiRouter.use("/admin", adminRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/platform", platformRoutes);

apiRouter.use((req, res, next) => {
  if (req.path.startsWith("/admin/organizations")) {
    return next();
  }

  return requireOrganizationContext(req, res, next);
});

apiRouter.use("/inbox", inboxRoutes);
apiRouter.use("/conversations", conversationRoutes);
apiRouter.use("/contacts", contactRoutes);
apiRouter.use("/messages", messageRoutes);
apiRouter.use("/whatsapp", requirePermission("messages.send"), whatsappRoutes);
