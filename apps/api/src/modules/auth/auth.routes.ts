import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getMe, login, updateMyPassword } from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(login));
authRoutes.get("/me", requireAuth, asyncHandler(getMe));
authRoutes.post("/me/password", requireAuth, asyncHandler(updateMyPassword));
