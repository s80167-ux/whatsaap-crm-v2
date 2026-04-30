import type { AuthUser } from "./auth.js";

declare global {
  namespace Express {
    interface AuthSessionState {
      accessToken: string;
      refreshToken: string | null;
      csrfToken: string | null;
    }

    interface Request {
      auth?: AuthUser;
      authSession?: AuthSessionState;
      requestId?: string;
    }
  }
}

export {};
