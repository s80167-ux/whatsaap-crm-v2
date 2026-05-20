import assert from "node:assert/strict";
import test from "node:test";
import { mergeContactWithoutDowngrade } from "./contactRecoveryMerge.js";

const existing = {
  display_name: "Siti Aminah",
  primary_phone_e164: "+60123456789",
  primary_phone_normalized: "+60123456789",
  primary_avatar_url: "https://example.test/avatar.jpg",
  company_name: "Aminah Enterprise"
};

test("existing name is not replaced by Unknown", () => {
  const result = mergeContactWithoutDowngrade(existing, { displayName: "Unknown" });
  assert.equal(result.display_name, "Siti Aminah");
});

test("existing phone is not replaced by null", () => {
  const result = mergeContactWithoutDowngrade(existing, { phoneNumber: null });
  assert.equal(result.primary_phone_normalized, "+60123456789");
});

test("existing profile picture is not replaced by null", () => {
  const result = mergeContactWithoutDowngrade(existing, { profilePicUrl: null });
  assert.equal(result.primary_avatar_url, "https://example.test/avatar.jpg");
});

test("better incoming data fills missing fields", () => {
  const result = mergeContactWithoutDowngrade(
    {
      display_name: "Unknown",
      primary_phone_e164: null,
      primary_phone_normalized: null,
      primary_avatar_url: null,
      company_name: null
    },
    {
      displayName: "Siti Aminah",
      phoneNumber: "0123456789",
      profilePicUrl: "https://example.test/avatar.jpg"
    }
  );

  assert.equal(result.display_name, "Siti Aminah");
  assert.equal(result.primary_phone_normalized, "+60123456789");
  assert.equal(result.primary_avatar_url, "https://example.test/avatar.jpg");
});
