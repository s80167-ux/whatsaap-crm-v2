import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AudienceColumnMappingStep } from "./AudienceColumnMappingStep";

test("renders only phone as required and name as optional", () => {
  const html = renderToStaticMarkup(
    <AudienceColumnMappingStep
      headers={["Name", "Phone"]}
      mapping={{ phone: "Phone" }}
      suggestions={[
        { field: "phone", sourceHeader: "Phone", confidence: "high", score: 100, reason: "exact_alias" },
        { field: "name", confidence: "low", score: 0, reason: "unmatched" }
      ]}
      manuallyChangedFields={new Set()}
      onChange={() => undefined}
    />
  );

  assert.match(html, /Phone \*/);
  assert.match(html, /Name \(optional\)/);
  assert.doesNotMatch(html, /Name \(optional\)<\/span><span class="text-coral"> \*/);
});

test("shows manual mapping state in the UI", () => {
  const html = renderToStaticMarkup(
    <AudienceColumnMappingStep
      headers={["Customer Name", "Contact No"]}
      mapping={{ name: "Customer Name", phone: "Contact No" }}
      suggestions={[
        { field: "name", sourceHeader: "Customer Name", confidence: "high", score: 100, reason: "exact_alias" },
        { field: "phone", sourceHeader: "Contact No", confidence: "high", score: 100, reason: "exact_alias" }
      ]}
      manuallyChangedFields={new Set(["name"])}
      onChange={() => undefined}
    />
  );

  assert.match(html, /Changed manually/);
  assert.match(html, /Your selection is being kept for this CSV\./);
});
