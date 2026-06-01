import type { Request, Response } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import {
  clearGoogleOAuthReturnToCookie,
  clearGoogleOAuthVerifierCookie,
  clearSessionCookies,
  getGoogleOAuthReturnToCookie,
  getGoogleOAuthVerifierCookie,
  issueCsrfToken,
  setCsrfCookie,
  setGoogleOAuthReturnToCookie,
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

const googleMobileLoginSchema = z.object({
  idToken: z.string().min(1)
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

type GoogleLoginErrorCode = "google_login_failed" | "google_account_not_linked" | "google_signup_pending";

function getOrigin(input: string) {
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function isLocalFrontendOrigin(origin: string) {
  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === "http:" &&
      (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function isProjectVercelOrigin(origin: string) {
  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === "https:" &&
      parsedOrigin.hostname.endsWith(".vercel.app") &&
      /^whats(?:app|aap)-crm-v2-/i.test(parsedOrigin.hostname)
    );
  } catch {
    return false;
  }
}

function isAllowedFrontendRedirectOrigin(origin: string, request?: Request) {
  if (origin === new URL(env.FRONTEND_URL).origin) {
    return true;
  }

  if (env.NODE_ENV !== "production" && isLocalFrontendOrigin(origin)) {
    return true;
  }

  if (isProjectVercelOrigin(origin)) {
    return true;
  }

  const requestOrigin = typeof request?.headers.origin === "string" ? getOrigin(request.headers.origin) : null;
  const requestReferer = typeof request?.headers.referer === "string" ? getOrigin(request.headers.referer) : null;

  return origin === requestOrigin || origin === requestReferer;
}

function getRequestedFrontendOrigin(request: Request) {
  const returnTo = typeof request.query.return_to === "string" ? request.query.return_to : null;
  const origin = returnTo ? getOrigin(returnTo) : null;

  return origin && isAllowedFrontendRedirectOrigin(origin, request) ? origin : null;
}

function isAllowedMobileRedirectUrl(input: string) {
  try {
    const parsedUrl = new URL(input);
    return parsedUrl.protocol === "com.example.rezeki_dashboard_app:" && parsedUrl.hostname === "login-callback";
  } catch {
    return false;
  }
}

function getRequestedMobileRedirectUrl(request: Request) {
  const redirectTo = typeof request.query.mobile_redirect_to === "string" ? request.query.mobile_redirect_to : null;
  return redirectTo && isAllowedMobileRedirectUrl(redirectTo) ? redirectTo : null;
}

function getStoredMobileRedirectUrl(request: Request) {
  const returnTo = getGoogleOAuthReturnToCookie(request.cookies);
  return returnTo && isAllowedMobileRedirectUrl(returnTo) ? returnTo : null;
}

function clearGoogleOAuthCookies(response: Response) {
  clearGoogleOAuthVerifierCookie(response);
  clearGoogleOAuthReturnToCookie(response);
}

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function getFrontendRedirectBase(request: Request) {
  const returnTo = getGoogleOAuthReturnToCookie(request.cookies);
  const origin = returnTo ? getOrigin(returnTo) : null;

  return origin && isAllowedFrontendRedirectOrigin(origin) ? origin : env.FRONTEND_URL;
}

function buildFrontendLoginUrl(
  request: Request,
  errorCode: GoogleLoginErrorCode
) {
  const loginUrl = new URL("/login", getFrontendRedirectBase(request));
  loginUrl.searchParams.set("error", errorCode);
  return loginUrl.toString();
}

function buildMobileCallbackUrl(
  redirectTo: string,
  input:
    | {
        status: "success";
        accessToken: string;
        refreshToken: string;
        csrfToken: string;
        user: unknown;
      }
    | { status: "error"; errorCode: GoogleLoginErrorCode }
) {
  const callbackUrl = new URL(redirectTo);
  callbackUrl.searchParams.set("status", input.status);

  if (input.status === "success") {
    callbackUrl.searchParams.set("access_token", input.accessToken);
    callbackUrl.searchParams.set("refresh_token", input.refreshToken);
    callbackUrl.searchParams.set("csrf_token", input.csrfToken);
    callbackUrl.searchParams.set("user", JSON.stringify(input.user));
  } else {
    callbackUrl.searchParams.set("error", input.errorCode);
  }

  return callbackUrl.toString();
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

export async function loginWithGoogleMobile(request: Request, response: Response) {
  const input = googleMobileLoginSchema.parse(request.body);
  const result = await authService.loginWithGoogleIdToken(input.idToken);
  const csrfToken = issueCsrfToken();
  setSessionCookies(response, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    csrfToken
  });
  setNoStore(response);
  return response.json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken
    },
    csrfToken
  });
}

export async function startGoogleLogin(request: Request, response: Response) {
  const { url, codeVerifier } = await authService.getGoogleOAuthUrl();
  const requestedMobileRedirectUrl = getRequestedMobileRedirectUrl(request);
  const requestedFrontendOrigin = getRequestedFrontendOrigin(request);

  setGoogleOAuthVerifierCookie(response, codeVerifier);
  if (requestedMobileRedirectUrl) {
    setGoogleOAuthReturnToCookie(response, requestedMobileRedirectUrl);
  } else if (requestedFrontendOrigin) {
    setGoogleOAuthReturnToCookie(response, requestedFrontendOrigin);
  }
  setNoStore(response);
  return response.redirect(url);
}

export async function handleGoogleCallback(request: Request, response: Response) {
  const code = typeof request.query.code === "string" ? request.query.code : null;
  const codeVerifier = getGoogleOAuthVerifierCookie(request.cookies);
  const mobileRedirectTo = getStoredMobileRedirectUrl(request);

  if (!code || !codeVerifier) {
    clearGoogleOAuthCookies(response);
    clearSessionCookies(response);
    setNoStore(response);
    if (mobileRedirectTo) {
      return response.redirect(buildMobileCallbackUrl(mobileRedirectTo, {
        status: "error",
        errorCode: "google_login_failed"
      }));
    }
    return response.redirect(buildFrontendLoginUrl(request, "google_login_failed"));
  }

  try {
    const result = await authService.completeGoogleLogin(code, codeVerifier);
    const csrfToken = issueCsrfToken();
    const frontendRedirectBase = getFrontendRedirectBase(request);
    clearGoogleOAuthCookies(response);
    setSessionCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      csrfToken
    });
    setNoStore(response);
    if (mobileRedirectTo) {
      return response.redirect(buildMobileCallbackUrl(mobileRedirectTo, {
        status: "success",
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken,
        user: result.user
      }));
    }
    return response.redirect(new URL("/dashboard", frontendRedirectBase).toString());
  } catch (error) {
    clearGoogleOAuthCookies(response);
    clearSessionCookies(response);
    setNoStore(response);
    const errorCode =
      isAppError(error) && error.code === "google_signup_pending"
        ? "google_signup_pending"
        : isAppError(error) && error.code === "crm_account_not_linked"
          ? "google_account_not_linked"
          : "google_login_failed";
    if (mobileRedirectTo) {
      return response.redirect(buildMobileCallbackUrl(mobileRedirectTo, {
        status: "error",
        errorCode
      }));
    }
    return response.redirect(buildFrontendLoginUrl(request, errorCode));
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

export async function getRealtimeToken(request: Request, response: Response) {
  requireAuth(request);

  if (!request.authSession?.accessToken) {
    throw new AppError("Realtime token is unavailable", 401, "realtime_token_unavailable");
  }

  setNoStore(response);
  return response.json({ data: { accessToken: request.authSession.accessToken } });
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
