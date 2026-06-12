import test from "node:test";
import assert from "node:assert/strict";
import { renderCampaignTemplate } from "./campaignTemplate";
import { extractTemplateVariables, findInvalidTemplateVariables, insertVariableIntoTemplate } from "./templateVariables";

test("extractTemplateVariables supports whitespace and removes duplicates", () => {
  assert.deepEqual(
    extractTemplateVariables("Hello {{ name }} {{product_interest}} {{name}}"),
    ["name", "product_interest"]
  );
});

test("renderCampaignTemplate renders canonical variables and preserves unknown variables", () => {
  const rendered = renderCampaignTemplate("Hi {{name}}, {{salutation}} {{notes}} {{unknown_field}}", {
    name: "Ahmad",
    gender: "male",
    notes: "Follow up"
  });

  assert.equal(rendered, "Hi Ahmad, Encik Follow up {{unknown_field}}");
});

test("renderCampaignTemplate replaces known missing variables with empty text", () => {
  const rendered = renderCampaignTemplate("{{name}}|{{location}}|{{salutation}}", {
    name: "Aina",
    gender: null
  });

  assert.equal(rendered, "Aina||Tuan/Puan");
});

test("insertVariableIntoTemplate inserts at the cursor position", () => {
  const result = insertVariableIntoTemplate("Hello there", "{{name}}", 6, 6);

  assert.equal(result.nextValue, "Hello {{name}}there");
  assert.equal(result.nextCursorPosition, 14);
});

test("insertVariableIntoTemplate replaces the selected text", () => {
  const result = insertVariableIntoTemplate("Hello friend", "{{phone}}", 6, 12);

  assert.equal(result.nextValue, "Hello {{phone}}");
  assert.equal(result.nextCursorPosition, 15);
});

test("findInvalidTemplateVariables detects unavailable variables after audience changes", () => {
  assert.deepEqual(
    findInvalidTemplateVariables("Hi {{name}} {{renewal_date}}", ["phone", "salutation", "name"]),
    ["renewal_date"]
  );
});
