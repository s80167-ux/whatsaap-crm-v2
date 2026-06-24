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
    delayPerMessageSeconds: 120,
    batchSize: 3,
    batchPauseSeconds: 1800,
    dailyLimit: 20,
    stopOnHighFailure: true
  },
  safe: {
    speedPreset: "safe",
    delayPerMessageSeconds: 90,
    batchSize: 4,
    batchPauseSeconds: 1200,
    dailyLimit: 30,
    stopOnHighFailure: true
  },
  balanced: {
    speedPreset: "balanced",
    delayPerMessageSeconds: 75,
    batchSize: 5,
    batchPauseSeconds: 900,
    dailyLimit: 40,
    stopOnHighFailure: true
  },
  normal: {
    speedPreset: "normal",
    delayPerMessageSeconds: 60,
    batchSize: 6,
    batchPauseSeconds: 720,
    dailyLimit: 50,
    stopOnHighFailure: true
  },
  fast: {
    speedPreset: "fast",
    delayPerMessageSeconds: 50,
    batchSize: 8,
    batchPauseSeconds: 600,
    dailyLimit: 60,
    stopOnHighFailure: true
  },
  custom: {
    speedPreset: "custom",
    delayPerMessageSeconds: 90,
    batchSize: 4,
    batchPauseSeconds: 1200,
    dailyLimit: 30,
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
