import test from "node:test";
import assert from "node:assert/strict";
import { autoMapAudienceColumns, parseAudienceCsv, suggestAudienceColumnMapping, validateAudienceRows } from "./audienceCsvValidation";
import { resolveAudienceMappingChange } from "./audienceColumnMapping";

test("auto maps exact current English headers", () => {
  assert.deepEqual(autoMapAudienceColumns(["name", "phone", "gender", "tag", "location", "product_interest", "customer_type", "notes"]), {
    name: "name",
    phone: "phone",
    gender: "gender",
    tag: "tag",
    location: "location",
    product_interest: "product_interest",
    customer_type: "customer_type",
    notes: "notes"
  });
});

test("auto maps English headers with spaces", () => {
  assert.deepEqual(autoMapAudienceColumns(["Full Name", "Phone Number", "City", "Product Interest"]), {
    name: "Full Name",
    phone: "Phone Number",
    location: "City",
    product_interest: "Product Interest"
  });
});

test("auto maps Bahasa Melayu headers", () => {
  assert.deepEqual(autoMapAudienceColumns(["Nama Penuh", "No. Telefon", "Bandar", "Produk Diminati"]), {
    name: "Nama Penuh",
    phone: "No. Telefon",
    location: "Bandar",
    product_interest: "Produk Diminati"
  });
});

test("auto maps mixed English and Malay headers", () => {
  assert.deepEqual(autoMapAudienceColumns(["Customer Name", "Contact No", "State", "Customer Segment", "Remarks"]), {
    name: "Customer Name",
    phone: "Contact No",
    location: "State",
    customer_type: "Customer Segment",
    notes: "Remarks"
  });
});

test("auto maps punctuation and underscore variants", () => {
  assert.deepEqual(autoMapAudienceColumns(["CUSTOMER_NAME", "WhatsApp No.", "Servis-Diminati"]), {
    name: "CUSTOMER_NAME",
    phone: "WhatsApp No.",
    product_interest: "Servis-Diminati"
  });
});

test("auto maps UTF-8 BOM on the first header", () => {
  assert.deepEqual(autoMapAudienceColumns(["\uFEFFPhone Number", "Nama Pelanggan"]), {
    phone: "\uFEFFPhone Number",
    name: "Nama Pelanggan"
  });
});

test("ambiguous type column remains unmapped", () => {
  const result = suggestAudienceColumnMapping(["Type", "Name"]);
  assert.equal(result.mapping.customer_type, undefined);
  assert.equal(result.mapping.name, "Name");
});

test("phone can be inferred from sample values", () => {
  const headers = ["Reach Me", "Nama"];
  const rows = [
    { rowNumber: 2, values: { "Reach Me": "0123456789", Nama: "Aina" } },
    { rowNumber: 3, values: { "Reach Me": "+60123456789", Nama: "Badrul" } },
    { rowNumber: 4, values: { "Reach Me": "60111222333", Nama: "Chen" } }
  ];

  const result = suggestAudienceColumnMapping(headers, rows);
  assert.equal(result.mapping.phone, "Reach Me");
  assert.equal(result.suggestions.find((item) => item.field === "phone")?.reason, "sample_phone");
});

test("gender can be inferred from sample values", () => {
  const headers = ["J", "Nama"];
  const rows = [
    { rowNumber: 2, values: { J: "Lelaki", Nama: "Aina" } },
    { rowNumber: 3, values: { J: "Perempuan", Nama: "Badrul" } },
    { rowNumber: 4, values: { J: "Lelaki", Nama: "Chen" } }
  ];

  const result = suggestAudienceColumnMapping(headers, rows);
  assert.equal(result.mapping.gender, "J");
  assert.equal(result.suggestions.find((item) => item.field === "gender")?.reason, "sample_gender");
});

test("does not duplicate one source column across automatic assignments", () => {
  const result = suggestAudienceColumnMapping(["Customer Name", "Name", "Contact No"]);
  const usedHeaders = Object.values(result.mapping);
  assert.equal(new Set(usedHeaders).size, usedHeaders.length);
});

test("unknown headers remain unmapped", () => {
  assert.deepEqual(autoMapAudienceColumns(["Foo", "Bar", "Baz"]), {});
});

test("maps the provided Malay example set", () => {
  assert.deepEqual(autoMapAudienceColumns(["Penerima", "Nombor Untuk Dihubungi", "Kawasan", "Servis Diminati"]), {
    name: "Penerima",
    phone: "Nombor Untuk Dihubungi",
    location: "Kawasan",
    product_interest: "Servis Diminati"
  });
});

test("manual selection clears previous duplicate mapping", () => {
  const resolved = resolveAudienceMappingChange(
    { name: "Customer Name", phone: "Contact No" },
    "name",
    "Contact No"
  );

  assert.deepEqual(resolved.mapping, { name: "Contact No" });
  assert.equal(resolved.clearedField, "phone");
});

test("validation keeps name optional while phone is required", () => {
  const parsed = parseAudienceCsv("phone,name\n0123456789,\n,Ali");
  const result = validateAudienceRows({
    headers: parsed.headers,
    rows: parsed.rows,
    mapping: { phone: "phone", name: "name" }
  });

  assert.equal(result.contacts[0]?.validation_status, "valid");
  assert.deepEqual(result.contacts[0]?.warnings, ["Name is empty"]);
  assert.equal(result.contacts[1]?.validation_status, "invalid");
});
