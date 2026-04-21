import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { getCurrentPermissions } from "./permissions.controller.js";

export const permissionRoutes = Router();

permissionRoutes.get("/me", asyncHandler(getCurrentPermissions));
