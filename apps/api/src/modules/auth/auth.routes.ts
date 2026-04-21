import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getMe, login } from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(login));
authRoutes.get("/me", requireAuth, asyncHandler(getMe));
