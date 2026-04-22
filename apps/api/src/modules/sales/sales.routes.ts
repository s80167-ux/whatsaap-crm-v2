import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAnyPermission, requirePermission } from "../../middleware/authMiddleware.js";
import {
  createSalesOrder,
  createSalesOrderItem,
  getSalesOrderDetail,
  getSalesOrderHistory,
  getSalesOrders,
  getSalesSummary,
  recordSalesShareLink,
  updateSalesOrder
} from "./sales.controller.js";

export const salesRoutes = Router();

salesRoutes.get(
  "/orders",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getSalesOrders)
);
salesRoutes.get(
  "/summary",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getSalesSummary)
);
salesRoutes.get(
  "/orders/:orderId",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getSalesOrderDetail)
);
salesRoutes.get(
  "/orders/:orderId/history",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(getSalesOrderHistory)
);
salesRoutes.post("/orders", requirePermission("sales.write"), asyncHandler(createSalesOrder));
salesRoutes.patch("/orders/:orderId", requirePermission("sales.write"), asyncHandler(updateSalesOrder));
salesRoutes.post("/orders/:orderId/items", requirePermission("sales.write"), asyncHandler(createSalesOrderItem));
salesRoutes.post(
  "/share-links/audit",
  requireAnyPermission(["sales.read_all", "sales.read_assigned"]),
  asyncHandler(recordSalesShareLink)
);
