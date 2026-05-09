import type { CookieOptions, Response } from "express";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

type SessionCookieInput = SessionTokens & {
  csrfToken?: string;
};

const GOOGLE_OAUTH_VERIFIER_COOKIE_NAME = "crm_google_oauth_verifier";
const GOOGLE_OAUTH_RETURN_TO_COOKIE_NAME = "crm_google_oauth_return_to";
const GOOGLE_OAUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 10;

function getCookieOptions(httpOnly: boolean, includeMaxAge = true): CookieOptions {
  return {
    httpOnly,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
    path: "/",
    ...(includeMaxAge ? { maxAge: env.COOKIE_MAX_AGE_MS } : {})
  };
}

function getGoogleOAuthVerifierCookieOptions(includeMaxAge = true): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    domain: env.COOKIE_DOMAIN,
    path: "/api/auth/google",
    ...(includeMaxAge ? { maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE_MS } : {})
  };
}

export function issueCsrfToken() {
  return randomUUID();
}

export function setSessionCookies(response: Response, input: SessionCookieInput) {
  response.cookie(env.SESSION_COOKIE_NAME, input.accessToken, getCookieOptions(true));
  response.cookie(env.REFRESH_COOKIE_NAME, input.refreshToken, getCookieOptions(true));
  setCsrfCookie(response, input.csrfToken ?? issueCsrfToken());
}

export function setCsrfCookie(response: Response, csrfToken: string) {
  response.cookie(env.CSRF_COOKIE_NAME, csrfToken, getCookieOptions(false));
}

export function clearSessionCookies(response: Response) {
  response.clearCookie(env.SESSION_COOKIE_NAME, getCookieOptions(true, false));
  response.clearCookie(env.REFRESH_COOKIE_NAME, getCookieOptions(true, false));
  response.clearCookie(env.CSRF_COOKIE_NAME, getCookieOptions(false, false));
}

export function setGoogleOAuthVerifierCookie(response: Response, codeVerifier: string) {
  response.cookie(GOOGLE_OAUTH_VERIFIER_COOKIE_NAME, codeVerifier, getGoogleOAuthVerifierCookieOptions());
}

export function setGoogleOAuthReturnToCookie(response: Response, returnTo: string) {
  response.cookie(GOOGLE_OAUTH_RETURN_TO_COOKIE_NAME, returnTo, getGoogleOAuthVerifierCookieOptions());
}

export function getGoogleOAuthVerifierCookie(requestCookies: Record<string, unknown> | undefined) {
  const cookieValue = requestCookies?.[GOOGLE_OAUTH_VERIFIER_COOKIE_NAME];
  return typeof cookieValue === "string" && cookieValue.length > 0 ? cookieValue : null;
}

export function getGoogleOAuthReturnToCookie(requestCookies: Record<string, unknown> | undefined) {
  const cookieValue = requestCookies?.[GOOGLE_OAUTH_RETURN_TO_COOKIE_NAME];
  return typeof cookieValue === "string" && cookieValue.length > 0 ? cookieValue : null;
}

export function clearGoogleOAuthVerifierCookie(response: Response) {
  response.clearCookie(GOOGLE_OAUTH_VERIFIER_COOKIE_NAME, getGoogleOAuthVerifierCookieOptions(false));
}

export function clearGoogleOAuthReturnToCookie(response: Response) {
  response.clearCookie(GOOGLE_OAUTH_RETURN_TO_COOKIE_NAME, getGoogleOAuthVerifierCookieOptions(false));
}

export function setNoStore(response: Response) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
}
