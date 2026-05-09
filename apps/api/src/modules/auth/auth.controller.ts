import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  clearGoogleOAuthVerifierCookie,
  clearSessionCookies,
  getGoogleOAuthVerifierCookie,
  issueCsrfToken,
  setCsrfCookie,
  setGoogleOAuthVerifierCookie,
  setNoStore,
  setSessionCookies
} from "../../lib/authCookies.js";
import { AppError, isAppError } from "../../lib/errors.js";
import { AuthService } from "../../services/authService.js";

const authService = new AuthService();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const updatePasswordSchema = z.object({
  password: z.string().min(8)
});

const avatarUrlSchema = z
  .string()
  .max(750_000)
  .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/)
  .optional()
  .nullable();

const updateProfileSchema = z.object({
  fullName: z.string().min(1).optional().nullable(),
  avatarUrl: avatarUrlSchema
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function buildFrontendLoginUrl(errorCode: "google_login_failed" | "google_account_not_linked") {
  const loginUrl = new URL("/login", env.FRONTEND_URL);
  loginUrl.searchParams.set("error", errorCode);
  return loginUrl.toString();
}

export async function login(request: Request, response: Response) {
  const input = loginSchema.parse(request.body);
  const result = await authService.login(input.email, input.password);
  const csrfToken = issueCsrfToken();
  setSessionCookies(response, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    csrfToken
  });
  setNoStore(response);
  return response.json({ data: { user: result.user }, csrfToken });
}

export async function startGoogleLogin(_request: Request, response: Response) {
  const { url, codeVerifier } = await authService.getGoogleOAuthUrl();
  setGoogleOAuthVerifierCookie(response, codeVerifier);
  setNoStore(response);
  return response.redirect(url);
}

export async function handleGoogleCallback(request: Request, response: Response) {
  const code = typeof request.query.code === "string" ? request.query.code : null;
  const codeVerifier = getGoogleOAuthVerifierCookie(request.cookies);

  if (!code || !codeVerifier) {
    clearGoogleOAuthVerifierCookie(response);
    clearSessionCookies(response);
    setNoStore(response);
    return response.redirect(buildFrontendLoginUrl("google_login_failed"));
  }

  try {
    const result = await authService.completeGoogleLogin(code, codeVerifier);
    const csrfToken = issueCsrfToken();
    clearGoogleOAuthVerifierCookie(response);
    setSessionCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken
    });
    setNoStore(response);
    return response.redirect(new URL("/", env.FRONTEND_URL).toString());
  } catch (error) {
    clearGoogleOAuthVerifierCookie(response);
    clearSessionCookies(response);
    setNoStore(response);
    const errorCode =
      isAppError(error) && error.code === "crm_account_not_linked" ? "google_account_not_linked" : "google_login_failed";
    return response.redirect(buildFrontendLoginUrl(errorCode));
  }
}

export async function getMe(request: Request, response: Response) {
  const auth = requireAuth(request);
  const profile = await authService.getProfile(auth);
  const csrfToken = request.authSession?.csrfToken ?? issueCsrfToken();

  if (!request.authSession?.csrfToken) {
    setCsrfCookie(response, csrfToken);
  }

  setNoStore(response);
  return response.json({ data: profile, csrfToken });
}

export async function updateMyPassword(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = updatePasswordSchema.parse(request.body);
  await authService.updatePassword(auth.authUserId, input.password);
  return response.json({ ok: true });
}

export async function updateMe(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = updateProfileSchema.parse(request.body);
  const profile = await authService.updateProfile(auth, {
    fullName: input.fullName ?? null,
    avatarUrl: input.avatarUrl ?? null
  });

  return response.json({ data: profile });
}

export async function logout(request: Request, response: Response) {
  const authSession = request.authSession;

  if (authSession?.accessToken) {
    try {
      await authService.logout(authSession.accessToken);
    } catch {
      // Clear local cookies even if upstream revoke fails.
    }
  }

  clearSessionCookies(response);
  setNoStore(response);
  return response.json({ ok: true });
}
