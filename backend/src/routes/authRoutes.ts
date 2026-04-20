import { Router } from "express";
import { getMe, login } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

export const authRoutes = Router();

authRoutes.post("/login", login);
authRoutes.get("/me", requireAuth, getMe);
