import type { Request, Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/authService.js";

const authService = new AuthService();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function login(request: Request, response: Response) {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input.email, input.password);
  return response.json({ data: result });
}

export async function getMe(request: Request, response: Response) {
  if (!request.auth) {
    return response.status(401).json({ error: "Authentication required" });
  }

  const profile = await authService.getProfile(request.auth);
  return response.json({ data: profile });
}
