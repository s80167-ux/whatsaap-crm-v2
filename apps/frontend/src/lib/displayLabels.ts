import type { TFunction } from "i18next";

function humanizeValue(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getTranslatedLabel(t: TFunction, key: string, fallbackValue: string) {
  const translated = t(key);
  return translated === key ? humanizeValue(fallbackValue) : translated;
}

export function getStatusLabel(status: string, t: TFunction) {
  return getTranslatedLabel(t, `displayLabels.status.${status.toLowerCase()}`, status);
}

export function getRiskFlagLabel(flag: string, t: TFunction) {
  return getTranslatedLabel(t, `displayLabels.riskFlag.${flag.toLowerCase()}`, flag);
}

export function getCampaignStatusLabel(status: string, t: TFunction) {
  return getTranslatedLabel(t, `displayLabels.campaignStatus.${status.toLowerCase()}`, status);
}

export function getRoleLabel(role: string, t: TFunction) {
  return getTranslatedLabel(t, `displayLabels.role.${role.toLowerCase()}`, role);
}

export function getChannelLabel(channel: string, t: TFunction) {
  return getTranslatedLabel(t, `displayLabels.channel.${channel.toLowerCase()}`, channel);
}