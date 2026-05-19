import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { SocialChannelsService } from "./socialChannels.service.js";

const socialChannelsService = new SocialChannelsService();

const accountParamsSchema = z.object({
  accountId: z.string().uuid()
});

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional()
});

const metaConnectQuerySchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  organization_id: z.string().uuid().optional()
});

const metaExchangeSchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional()
});

const metaConnectPageSchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  pageId: z.string().trim().min(1),
  state: z.string().trim().optional().nullable()
});

const createAccountSchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
  label: z.string().trim().min(2).max(120),
  externalAccountName: z.string().trim().max(160).optional().nullable(),
  externalAccountId: z.string().trim().max(160).optional().nullable(),
  username: z.string().trim().max(160).optional().nullable(),
  organizationId: z.string().uuid().optional().nullable()
});

const updateAccountSchema = createAccountSchema.omit({ platform: true });

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

export async function listSocialChannelAccounts(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { organization_id: organizationId } = organizationQuerySchema.parse(request.query);
  const accounts = await socialChannelsService.listAccounts(auth, organizationId);

  return response.json({ data: accounts });
}

export async function createSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = createAccountSchema.parse(request.body);
  const account = await socialChannelsService.createAccount(auth, input);

  return response.status(201).json({ data: account });
}

export async function updateSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const input = updateAccountSchema.parse(request.body);
  const account = await socialChannelsService.updateAccount(auth, accountId, input);

  return response.json({ data: account });
}

export async function getSocialChannelAccountStatus(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const { organization_id: organizationId } = organizationQuerySchema.parse(request.query);
  const status = await socialChannelsService.getAccountStatus(auth, accountId, organizationId);

  return response.json({ data: status });
}

export async function disconnectSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const { organizationId } = z.object({ organizationId: z.string().uuid().optional().nullable() }).parse(request.body ?? {});
  const account = await socialChannelsService.disconnectAccount(auth, accountId, organizationId);

  return response.json({ data: account });
}

export async function resubscribeSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const { organizationId } = z.object({ organizationId: z.string().uuid().optional().nullable() }).parse(request.body ?? {});
  const account = await socialChannelsService.resubscribeAccount(auth, accountId, organizationId);

  return response.json({ data: account });
}

export async function deleteSocialChannelAccount(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { accountId } = accountParamsSchema.parse(request.params);
  const { organization_id: organizationId } = organizationQuerySchema.parse(request.query);
  await socialChannelsService.deleteAccount(auth, accountId, organizationId);

  return response.json({ ok: true });
}

export async function getMetaConnectUrl(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { platform, organization_id: organizationId } = metaConnectQuerySchema.parse(request.query);
  const result = socialChannelsService.getMetaConnectUrl(auth, platform, organizationId);

  return response.json({ data: result });
}

export async function exchangeMetaCode(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = metaExchangeSchema.parse(request.body);
  const result = await socialChannelsService.exchangeMetaCode(auth, input);
  const status = result.enabled === false ? 501 : 200;

  return response.status(status).json({
    data: result,
    error: result.enabled === false ? result.message : undefined
  });
}

export async function connectMetaPage(request: Request, response: Response) {
  const auth = requireAuth(request);
  const input = metaConnectPageSchema.parse(request.body);
  const result = await socialChannelsService.connectMetaPage(auth, input);
  const status = result.enabled === false ? 501 : 200;

  return response.status(status).json({
    data: result,
    error: result.enabled === false ? result.message : undefined
  });
}
