import { z } from "zod";

export const campaignSpeedPresetSchema = z.enum(["very_safe", "safe", "balanced", "normal", "fast", "custom"]);

export type CampaignSpeedPreset = z.infer<typeof campaignSpeedPresetSchema>;

export type CampaignTempo = {
  speedPreset: CampaignSpeedPreset;
  delayPerMessageSeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  dailyLimit: number;
  stopOnHighFailure: boolean;
};

type CampaignTempoInput = Partial<Omit<CampaignTempo, "speedPreset">> & {
  speedPreset?: string | null;
};

export const campaignTempoPresets: Record<CampaignSpeedPreset, CampaignTempo> = {
  very_safe: {
    speedPreset: "very_safe",
    delayPerMessageSeconds: 30,
    batchSize: 8,
    batchPauseSeconds: 420,
    dailyLimit: 80,
    stopOnHighFailure: true
  },
  safe: {
    speedPreset: "safe",
    delayPerMessageSeconds: 22,
    batchSize: 12,
    batchPauseSeconds: 300,
    dailyLimit: 150,
    stopOnHighFailure: true
  },
  balanced: {
    speedPreset: "balanced",
    delayPerMessageSeconds: 16,
    batchSize: 15,
    batchPauseSeconds: 180,
    dailyLimit: 250,
    stopOnHighFailure: true
  },
  normal: {
    speedPreset: "normal",
    delayPerMessageSeconds: 12,
    batchSize: 20,
    batchPauseSeconds: 120,
    dailyLimit: 350,
    stopOnHighFailure: true
  },
  fast: {
    speedPreset: "fast",
    delayPerMessageSeconds: 9,
    batchSize: 25,
    batchPauseSeconds: 90,
    dailyLimit: 500,
    stopOnHighFailure: true
  },
  custom: {
    speedPreset: "custom",
    delayPerMessageSeconds: 22,
    batchSize: 12,
    batchPauseSeconds: 300,
    dailyLimit: 150,
    stopOnHighFailure: true
  }
};

export const campaignTempoSchema = z.object({
  speedPreset: campaignSpeedPresetSchema.default("safe"),
  delayPerMessageSeconds: z.number().int().positive().optional(),
  batchSize: z.number().int().positive().optional(),
  batchPauseSeconds: z.number().int().positive().optional(),
  dailyLimit: z.number().int().positive().optional(),
  stopOnHighFailure: z.boolean().optional()
}).transform((input) => resolveCampaignTempo(input));

export function resolveCampaignTempo(input?: CampaignTempoInput | null): CampaignTempo {
  const speedPreset = normalizeSpeedPreset(input?.speedPreset);
  const preset = campaignTempoPresets[speedPreset] ?? campaignTempoPresets.safe;

  return {
    speedPreset,
    delayPerMessageSeconds: sanitizePositiveInt(input?.delayPerMessageSeconds, preset.delayPerMessageSeconds),
    batchSize: sanitizePositiveInt(input?.batchSize, preset.batchSize),
    batchPauseSeconds: sanitizePositiveInt(input?.batchPauseSeconds, preset.batchPauseSeconds),
    dailyLimit: sanitizePositiveInt(input?.dailyLimit, preset.dailyLimit),
    stopOnHighFailure: input?.stopOnHighFailure ?? preset.stopOnHighFailure
  };
}

function sanitizePositiveInt(value: number | null | undefined, fallback: number) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return fallback;
  }

  return Math.round(nextValue);
}

function normalizeSpeedPreset(value: string | null | undefined): CampaignSpeedPreset {
  if (value && value in campaignTempoPresets) {
    return value as CampaignSpeedPreset;
  }

  return "safe";
}
