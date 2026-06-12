import type { AudienceTemplateVariableKey } from "../audience-groups/types/audienceGroup.types";

export const campaignVariableDisplayOrder: AudienceTemplateVariableKey[] = [
  "name",
  "phone",
  "salutation",
  "gender",
  "tag",
  "location",
  "product_interest",
  "customer_type",
  "notes"
];

export const campaignVariableLabels: Record<AudienceTemplateVariableKey, string> = {
  name: "Name",
  phone: "Phone",
  salutation: "Salutation",
  gender: "Gender",
  tag: "Tag",
  location: "Location",
  product_interest: "Product Interest",
  customer_type: "Customer Type",
  notes: "Notes"
};

export function deriveCampaignSalutation(gender?: string | null) {
  if (gender === "male") {
    return "Encik";
  }

  if (gender === "female") {
    return "Puan";
  }

  return "Tuan/Puan";
}
