import type { Request, Response } from "express";
import { z } from "zod";
import { callDeepSeekMessageAssist } from "../../services/aiMessageAssistService.js";

const messageAssistSchema = z.object({
  source: z.enum(["campaign", "template"]),
  action: z.enum(["improve", "shorten", "friendly", "professional", "check"]),
  message: z.string().trim().min(1, "Message is required").max(3000, "Message must be 3000 characters or fewer"),
  language: z.enum(["ms-MY", "en-MY"]).optional(),
  tone: z.string().trim().max(80).optional(),
  variables: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  campaignObjective: z.string().trim().max(500).optional(),
  templatePurpose: z.string().trim().max(500).optional(),
  audienceContext: z.record(z.unknown()).optional()
});

export async function assistMessage(request: Request, response: Response) {
  const input = messageAssistSchema.parse(request.body);
  const result = await callDeepSeekMessageAssist(input);

  return response.json(result);
}
