import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { SocialChannelsService } from "./socialChannels.service.js";

const socialChannelsService = new SocialChannelsService();

const accountParamsSchema = z.object({
  accountId: z.string().uuid()
});

const metaConnectQuerySchema = z.object({
  platform: z.enum(["facebook", "instagram"])
});

const metaExchangeSchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional()
});

const createAccountSchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  label: z.string().trim().min(2).max(120),
  externalAccountName: z.string().trim().max(160).optional().nullable(),
  externalAccountId: z.string().trim().max(160).optional().nullable(),
  username: z.string().trim().max(160).optional().nullable()
});

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function listSocialChannelAccounts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const accounts = await socialChannelsService.listAccounts(auth);

  return response.json({ data: accounts });
}

export async function createSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createAccountSchema.parse(request.body);
  const account = await socialChannelsService.createAccount(auth, input);

  return response.status(201).json({ data: account });
}

export async function getSocialChannelAccountStatus(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const status = await socialChannelsService.getAccountStatus(auth, accountId);

  return response.json({ data: status });
}

export async function disconnectSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const account = await socialChannelsService.disconnectAccount(auth, accountId);

  return response.json({ data: account });
}

export async function getMetaConnectUrl(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { platform } = metaConnectQuerySchema.parse(request.query);
  const result = socialChannelsService.getMetaConnectUrl(auth, platform);

  return response.json({ data: result });
}

export async function exchangeMetaCode(request: Request, response: Response) {
  const auth = requireAuth(request);
  metaExchangeSchema.parse(request.body);
  const result = socialChannelsService.exchangeMetaCode(auth);

  return response.status(501).json({ data: result, error: result.message });
}
