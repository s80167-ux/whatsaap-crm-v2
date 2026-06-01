import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { requireAuth, requireCsrf } from "../../middleware/authMiddleware.js";
import {
  getMe,
  getRealtimeToken,
  handleGoogleCallback,
  login,
  loginWithGoogleMobile,
  logout,
  startGoogleLogin,
  updateMe,
  updateMyPassword
} from "./auth.controller.js";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(login));
authRoutes.post("/google/mobile", asyncHandler(loginWithGoogleMobile));
authRoutes.get("/google/start", asyncHandler(startGoogleLogin));
authRoutes.get("/google/callback", asyncHandler(handleGoogleCallback));
authRoutes.get("/me", requireAuth, asyncHandler(getMe));
authRoutes.get("/realtime-token", requireAuth, asyncHandler(getRealtimeToken));
authRoutes.post("/logout", requireAuth, requireCsrf, asyncHandler(logout));
authRoutes.patch("/me", requireAuth, requireCsrf, asyncHandler(updateMe));
authRoutes.post("/me/password", requireAuth, requireCsrf, asyncHandler(updateMyPassword));
