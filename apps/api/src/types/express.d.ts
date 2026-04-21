import type { AuthUser } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
