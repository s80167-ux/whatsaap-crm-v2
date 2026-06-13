import type { Campaign, CampaignSpeedPreset, CampaignTempo } from "../types/campaign.types";

export const campaignTempoPresetLabels: Record<CampaignSpeedPreset, string> = {
  very_safe: "Very Safe",
  safe: "Safe",
  balanced: "Balanced",
  normal: "Normal",
  fast: "Fast",
  custom: "Custom"
};

export const selectableCampaignTempoPresets: CampaignSpeedPreset[] = ["very_safe", "safe", "balanced", "normal", "fast", "custom"];

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

export function resolveCampaignTempo(input?: Partial<CampaignTempo> | null): CampaignTempo {
  const speedPreset = input?.speedPreset ?? "safe";
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

export function getCampaignTempo(campaign: Campaign): CampaignTempo {
  return resolveCampaignTempo({
    speedPreset: campaign.speedPreset,
    delayPerMessageSeconds: campaign.delayPerMessageSeconds,
    batchSize: campaign.batchSize,
    batchPauseSeconds: campaign.batchPauseSeconds,
    dailyLimit: campaign.dailyLimit,
    stopOnHighFailure: campaign.stopOnHighFailure
  });
}

export function getCampaignTempoPresetHelpText(speedPreset: CampaignSpeedPreset) {
  switch (speedPreset) {
    case "very_safe":
      return "Best for new numbers, reconnect recovery, and warm-up campaigns.";
    case "safe":
      return "Recommended default. Safe for most normal campaigns.";
    case "balanced":
      return "Moderate pace while still staying cautious.";
    case "normal":
      return "For stable and regularly used senders.";
    case "fast":
      return "For matured senders only. Not recommended for new or recently reconnected WhatsApp numbers.";
    case "custom":
      return "Manually override delay, batch size, pause, daily limit, and failure protection.";
    default:
      return "";
  }
}

export function formatCampaignTempoSummary(tempoInput: Partial<CampaignTempo>, senderCount = 1) {
  const tempo = resolveCampaignTempo(tempoInput);
  const presetLabel = campaignTempoPresetLabels[tempo.speedPreset];
  const pauseLabel = formatPauseLabel(tempo.batchPauseSeconds);
  const perSenderDailyLabel = `${tempo.dailyLimit.toLocaleString()} messages/day per sender`;
  const totalDailyCapacity = senderCount > 1 ? ` Up to ${(tempo.dailyLimit * senderCount).toLocaleString()} messages/day total across ${senderCount} senders.` : "";
  return `${presetLabel} tempo: ${tempo.delayPerMessageSeconds}s per message, ${tempo.batchSize} messages per batch, ${pauseLabel} after each batch, ${perSenderDailyLabel}.${totalDailyCapacity}`;
}

function formatPauseLabel(batchPauseSeconds: number) {
  if (batchPauseSeconds % 60 === 0) {
    const minutes = batchPauseSeconds / 60;
    return `${minutes} min pause`;
  }

  return `${batchPauseSeconds}s pause`;
}

function sanitizePositiveInt(value: number | undefined, fallback: number) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue) || nextValue <= 0) {
    return fallback;
  }

  return Math.round(nextValue);
}
