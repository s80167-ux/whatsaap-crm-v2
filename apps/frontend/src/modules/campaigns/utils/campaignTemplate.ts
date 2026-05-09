import type { CampaignContact } from "../types/campaign.types";

function getSalutation(contact: CampaignContact) {
  if (contact.gender === "male") {
    return "Encik";
  }

  if (contact.gender === "female") {
    return "Puan";
  }

  return "Tuan/Puan";
}

export function renderCampaignTemplate(template: string, contact: CampaignContact) {
  return template
    .split("{{name}}").join(contact.name)
    .split("{{phone}}").join(contact.phone)
    .split("{{tag}}").join(contact.tag ?? "")
    .split("{{salutation}}").join(getSalutation(contact));
}
