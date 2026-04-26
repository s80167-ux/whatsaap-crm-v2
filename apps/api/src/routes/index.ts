import { Router } from "express";
import { requireAuth, requireOrganizationContext } from "../middleware/authMiddleware.js";
import { adminRoutes } from "../modules/admin/admin.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { contactRoutes } from "../modules/contacts/contacts.routes.js";
import { conversationRoutes } from "../modules/conversations/conversations.routes.js";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes.js";
import { inboxRoutes } from "../modules/inbox/inbox.routes.js";
import { leadRoutes } from "../modules/leads/leads.routes.js";
import { messageRoutes } from "../modules/messages/messages.routes.js";
import { organizationRoutes } from "../modules/organizations/organizations.routes.js";
import { permissionRoutes } from "../modules/permissions/permissions.routes.js";
import { platformRoutes } from "../modules/platform/platform.routes.js";
import { quickReplyRoutes } from "../modules/quickReplies/quickReplies.routes.js";
import { reportRoutes } from "../modules/reports/reports.routes.js";
import { salesRoutes } from "../modules/sales/sales.routes.js";
import { userRoutes } from "../modules/users/users.routes.js";
import { whatsappRoutes } from "../modules/whatsapp/whatsapp.routes.js";
import { superAdminClearDataRoutes } from "../modules/superAdmin/superAdminClearData.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

apiRouter.use("/auth", authRoutes);

apiRouter.use(requireAuth);

// SUPER ADMIN ONLY TOOL
apiRouter.use("/super-admin", superAdminClearDataRoutes);

apiRouter.use("/admin", adminRoutes);
apiRouter.use("/admin/organizations", organizationRoutes);
apiRouter.use("/admin/users", userRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/organizations", organizationRoutes);
apiRouter.use("/permissions", permissionRoutes);
apiRouter.use("/platform", platformRoutes);
apiRouter.use("/users", userRoutes);

apiRouter.use((req, res, next) => {
  if (req.path.startsWith("/admin/organizations") || req.path.startsWith("/super-admin")) {
    return next();
  }

  return requireOrganizationContext(req, res, next);
});

apiRouter.use("/inbox", inboxRoutes);
apiRouter.use("/conversations", conversationRoutes);
apiRouter.use("/contacts", contactRoutes);
apiRouter.use("/leads", leadRoutes);
apiRouter.use("/messages", messageRoutes);
apiRouter.use("/quick-replies", quickReplyRoutes);
apiRouter.use("/reports", reportRoutes);
apiRouter.use("/sales", salesRoutes);
apiRouter.use("/whatsapp", whatsappRoutes);
