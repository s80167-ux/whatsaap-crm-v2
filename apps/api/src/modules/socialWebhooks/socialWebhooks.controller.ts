import type { Request, Response } from "express";
import { SocialWebhooksService } from "./socialWebhooks.service.js";

const socialWebhooksService = new SocialWebhooksService();

export async function verifyMetaWebhook(request: Request, response: Response) {
  const challenge = socialWebhooksService.verifyMetaChallenge({
    mode: request.query["hub.mode"],
    verifyToken: request.query["hub.verify_token"],
    challenge: request.query["hub.challenge"]
  });

  return response.status(200).send(challenge);
}

export async function receiveMetaWebhook(request: Request, response: Response) {
  socialWebhooksService.verifySignature(request);
  const result = await socialWebhooksService.storeMetaPayload(request.body);

  return response.status(200).json({ ok: true, ...result });
}
