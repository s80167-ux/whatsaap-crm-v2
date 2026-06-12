import { query } from "../../config/database.js";
import { AppError } from "../../lib/errors.js";

export const campaignTemplateVariableOrder = [
  "name",
  "phone",
  "salutation",
  "gender",
  "tag",
  "location",
  "product_interest",
  "customer_type",
  "notes"
] as const;

export type CampaignTemplateVariableKey = (typeof campaignTemplateVariableOrder)[number];

export type CampaignTemplateVariable = {
  key: CampaignTemplateVariableKey;
  label: string;
  sampleValue: string;
  source: "mapped" | "derived";
};

export type AudienceTemplateVariablesResponse = {
  audienceGroupId: string;
  variables: CampaignTemplateVariable[];
  sampleValues: Partial<Record<CampaignTemplateVariableKey, string>>;
};

type AudienceGroupLookup = {
  id: string;
  status: string;
  valid_count: number;
  storage_status: "active" | "archived" | "deleted_details";
};

export type AudienceTemplateVariableAggregateRow = {
  phone_sample: string | null;
  name_sample: string | null;
  gender_sample: "male" | "female" | null;
  tag_sample: string | null;
  location_sample: string | null;
  product_interest_sample: string | null;
  customer_type_sample: string | null;
  notes_sample: string | null;
  has_name: boolean | null;
  has_gender: boolean | null;
  has_tag: boolean | null;
  has_location: boolean | null;
  has_product_interest: boolean | null;
  has_customer_type: boolean | null;
  has_notes: boolean | null;
};

const variableDefinitions: Record<
  CampaignTemplateVariableKey,
  { label: string; source: "mapped" | "derived" }
> = {
  name: { label: "Name", source: "mapped" },
  phone: { label: "Phone", source: "mapped" },
  salutation: { label: "Salutation", source: "derived" },
  gender: { label: "Gender", source: "mapped" },
  tag: { label: "Tag", source: "mapped" },
  location: { label: "Location", source: "mapped" },
  product_interest: { label: "Product Interest", source: "mapped" },
  customer_type: { label: "Customer Type", source: "mapped" },
  notes: { label: "Notes", source: "mapped" }
};

export function deriveSalutation(gender?: string | null) {
  if (gender === "male") {
    return "Encik";
  }

  if (gender === "female") {
    return "Puan";
  }

  return "Tuan/Puan";
}

export function extractTemplateVariableKeys(template: string) {
  const found = new Set<string>();

  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const normalizedKey = key.trim();

    if (normalizedKey) {
      found.add(normalizedKey);
    }

    return _match;
  });

  return Array.from(found);
}

export function renderCampaignTemplateVariables(
  template: string,
  values: Partial<Record<CampaignTemplateVariableKey, string | null | undefined>>
) {
  const resolvedValues: Partial<Record<CampaignTemplateVariableKey, string>> = {
    name: values.name ?? "",
    phone: values.phone ?? "",
    gender: values.gender ?? "",
    salutation: values.salutation ?? deriveSalutation(values.gender),
    tag: values.tag ?? "",
    location: values.location ?? "",
    product_interest: values.product_interest ?? "",
    customer_type: values.customer_type ?? "",
    notes: values.notes ?? ""
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const normalizedKey = key.trim() as CampaignTemplateVariableKey;

    if (!(normalizedKey in variableDefinitions)) {
      return match;
    }

    return resolvedValues[normalizedKey] ?? "";
  });
}

export async function findAudienceGroupForTemplateVariables(organizationId: string, audienceGroupId: string) {
  const result = await query<AudienceGroupLookup>(
    `
      select id, status, valid_count, storage_status
      from campaign_audience_groups
      where organization_id = $1
        and id = $2
      limit 1
    `,
    [organizationId, audienceGroupId]
  );

  const group = result.rows[0];

  if (!group) {
    throw new AppError("Audience Group not found", 404, "audience_group_not_found");
  }

  if (group.storage_status === "deleted_details") {
    throw new AppError("Audience Group details are no longer available", 400, "audience_group_not_ready");
  }

  return group;
}

export async function getAudienceTemplateVariableMetadata(
  organizationId: string,
  audienceGroupId: string
): Promise<AudienceTemplateVariablesResponse> {
  await findAudienceGroupForTemplateVariables(organizationId, audienceGroupId);

  const result = await query<AudienceTemplateVariableAggregateRow>(
    `
      select
        min(phone_normalized) as phone_sample,
        min(name) filter (where nullif(trim(name), '') is not null) as name_sample,
        min(gender) filter (where gender in ('male', 'female')) as gender_sample,
        min(tag) filter (where nullif(trim(tag), '') is not null) as tag_sample,
        min(location) filter (where nullif(trim(location), '') is not null) as location_sample,
        min(product_interest) filter (where nullif(trim(product_interest), '') is not null) as product_interest_sample,
        min(customer_type) filter (where nullif(trim(customer_type), '') is not null) as customer_type_sample,
        min(notes) filter (where nullif(trim(notes), '') is not null) as notes_sample,
        bool_or(nullif(trim(name), '') is not null) as has_name,
        bool_or(gender in ('male', 'female')) as has_gender,
        bool_or(nullif(trim(tag), '') is not null) as has_tag,
        bool_or(nullif(trim(location), '') is not null) as has_location,
        bool_or(nullif(trim(product_interest), '') is not null) as has_product_interest,
        bool_or(nullif(trim(customer_type), '') is not null) as has_customer_type,
        bool_or(nullif(trim(notes), '') is not null) as has_notes
      from campaign_audience_contacts
      where organization_id = $1
        and audience_group_id = $2
        and validation_status = 'valid'
        and is_duplicate = false
        and is_opted_out = false
        and nullif(trim(phone_normalized), '') is not null
    `,
    [organizationId, audienceGroupId]
  );

  const row = result.rows[0] ?? {
    phone_sample: null,
    name_sample: null,
    gender_sample: null,
    tag_sample: null,
    location_sample: null,
    product_interest_sample: null,
    customer_type_sample: null,
    notes_sample: null,
    has_name: false,
    has_gender: false,
    has_tag: false,
    has_location: false,
    has_product_interest: false,
    has_customer_type: false,
    has_notes: false
  };

  return buildAudienceTemplateVariableMetadata(audienceGroupId, row);
}

export function buildAudienceTemplateVariableMetadata(
  audienceGroupId: string,
  row: AudienceTemplateVariableAggregateRow
): AudienceTemplateVariablesResponse {
  const sampleValues: Partial<Record<CampaignTemplateVariableKey, string>> = {};

  if (row.name_sample) sampleValues.name = row.name_sample;
  if (row.phone_sample) sampleValues.phone = row.phone_sample;
  if (row.gender_sample) sampleValues.gender = row.gender_sample;
  if (row.tag_sample) sampleValues.tag = row.tag_sample;
  if (row.location_sample) sampleValues.location = row.location_sample;
  if (row.product_interest_sample) sampleValues.product_interest = row.product_interest_sample;
  if (row.customer_type_sample) sampleValues.customer_type = row.customer_type_sample;
  if (row.notes_sample) sampleValues.notes = row.notes_sample;
  sampleValues.salutation = deriveSalutation(row.gender_sample);

  const availableKeys = new Set<CampaignTemplateVariableKey>(["phone", "salutation"]);

  if (row.has_name) availableKeys.add("name");
  if (row.has_gender) availableKeys.add("gender");
  if (row.has_tag) availableKeys.add("tag");
  if (row.has_location) availableKeys.add("location");
  if (row.has_product_interest) availableKeys.add("product_interest");
  if (row.has_customer_type) availableKeys.add("customer_type");
  if (row.has_notes) availableKeys.add("notes");

  const variables = campaignTemplateVariableOrder
    .filter((key) => availableKeys.has(key))
    .map((key) => ({
      key,
      label: variableDefinitions[key].label,
      sampleValue: sampleValues[key] ?? "",
      source: variableDefinitions[key].source
    }));

  return {
    audienceGroupId,
    variables,
    sampleValues
  };
}

export async function assertCampaignTemplateVariablesAvailable(input: {
  organizationId: string;
  audienceGroupId: string;
  template: string | null | undefined;
}) {
  const template = input.template?.trim() ?? "";

  if (!template) {
    return;
  }

  const usedVariables = extractTemplateVariableKeys(template);

  if (usedVariables.length === 0) {
    return;
  }

  const metadata = await getAudienceTemplateVariableMetadata(input.organizationId, input.audienceGroupId);
  const availableKeys = new Set(metadata.variables.map((variable) => variable.key));
  const invalidVariables = usedVariables.filter((key) => !availableKeys.has(key as CampaignTemplateVariableKey));

  if (invalidVariables.length > 0) {
    throw new AppError(
      "Message contains variables unavailable in the selected audience.",
      400,
      "campaign_template_variables_invalid",
      { invalidVariables }
    );
  }
}
