import type { Request, Response } from "express";
import { z } from "zod";
import { ContactIdentityResolverService } from "../services/contactIdentityResolverService.js";

const resolverService = new ContactIdentityResolverService();

const accountParamSchema = z.object({
  accountId: z.string().uuid()
});

const resolveContactIdentitySchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  jid: z.string().min(3).optional().nullable(),
  lid: z.string().min(3).optional().nullable(),
  knownPhone: z.string().min(6).optional().nullable(),
  displayName: z.string().optional().nullable()
}).refine(
  (input) => Boolean(input.jid || input.lid || input.knownPhone),
  { message: "jid, lid, or knownPhone is required" }
);

export async function resolveContactIdentity(req: Request, res: Response) {
  const { accountId } = accountParamSchema.parse(req.params);
  const input = resolveContactIdentitySchema.parse(req.body);
  const result = await resolverService.resolve(accountId, input);
  return res.json({ data: result });
}
