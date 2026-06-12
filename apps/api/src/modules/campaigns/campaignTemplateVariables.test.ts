import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAudienceTemplateVariableMetadata,
  deriveSalutation,
  extractTemplateVariableKeys,
  renderCampaignTemplateVariables,
  type AudienceTemplateVariableAggregateRow
} from "./campaignTemplateVariables.js";

function aggregateRow(overrides: Partial<AudienceTemplateVariableAggregateRow> = {}): AudienceTemplateVariableAggregateRow {
  return {
    phone_sample: "60123456789",
    name_sample: "Ahmad",
    gender_sample: "male",
    tag_sample: "VIP",
    location_sample: null,
    product_interest_sample: null,
    customer_type_sample: null,
    notes_sample: null,
    has_name: true,
    has_gender: true,
    has_tag: true,
    has_location: false,
    has_product_interest: false,
    has_customer_type: false,
    has_notes: false,
    ...overrides
  };
}

test("metadata returns name phone salutation and tag when those fields have usable data", () => {
  const metadata = buildAudienceTemplateVariableMetadata("aud-1", aggregateRow());

  assert.deepEqual(
    metadata.variables.map((variable: { key: string }) => variable.key),
    ["name", "phone", "salutation", "gender", "tag"]
  );
  assert.equal(metadata.sampleValues.name, "Ahmad");
  assert.equal(metadata.sampleValues.phone, "60123456789");
  assert.equal(metadata.sampleValues.salutation, "Encik");
});

test("metadata omits name when every name is empty", () => {
  const metadata = buildAudienceTemplateVariableMetadata("aud-1", aggregateRow({
    name_sample: null,
    has_name: false
  }));

  assert.deepEqual(
    metadata.variables.map((variable: { key: string }) => variable.key),
    ["phone", "salutation", "gender", "tag"]
  );
});

test("metadata omits gender when every gender is unknown and still keeps salutation", () => {
  const metadata = buildAudienceTemplateVariableMetadata("aud-1", aggregateRow({
    gender_sample: null,
    has_gender: false
  }));

  assert.deepEqual(
    metadata.variables.map((variable: { key: string }) => variable.key),
    ["name", "phone", "salutation", "tag"]
  );
  assert.equal(metadata.sampleValues.salutation, "Tuan/Puan");
});

test("metadata omits empty optional fields", () => {
  const metadata = buildAudienceTemplateVariableMetadata("aud-1", aggregateRow({
    tag_sample: null,
    has_tag: false,
    notes_sample: null,
    has_notes: false
  }));

  assert.equal(metadata.variables.some((variable: { key: string }) => variable.key === "tag"), false);
  assert.equal(metadata.variables.some((variable: { key: string }) => variable.key === "notes"), false);
});

test("template variable extraction trims whitespace and removes duplicates", () => {
  assert.deepEqual(
    extractTemplateVariableKeys("Hi {{ name }} {{product_interest}} {{name}}"),
    ["name", "product_interest"]
  );
});

test("renderer supports canonical fields and preserves unknown variables", () => {
  const rendered = renderCampaignTemplateVariables(
    "Hi {{ name }}, {{salutation}} {{customer_type}} {{unknown_field}}",
    {
      name: "Ahmad",
      gender: "male",
      customer_type: "existing"
    }
  );

  assert.equal(rendered, "Hi Ahmad, Encik existing {{unknown_field}}");
});

test("deriveSalutation falls back to Tuan/Puan for missing or unknown values", () => {
  assert.equal(deriveSalutation("male"), "Encik");
  assert.equal(deriveSalutation("female"), "Puan");
  assert.equal(deriveSalutation("unknown"), "Tuan/Puan");
  assert.equal(deriveSalutation(null), "Tuan/Puan");
});
