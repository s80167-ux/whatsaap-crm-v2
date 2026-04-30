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

export function setNoStore(response: Response) {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
}
