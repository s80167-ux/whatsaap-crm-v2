import assert from "node:assert/strict";
import test from "node:test";
import {
  isBetterDisplayName,
  isBlockedDisplayName,
  isWeakDisplayName,
  sanitizeWhatsAppDisplayName,
  scoreContactIdentity
} from "./contactIdentity.js";

test("valid existing display name is not overwritten by null", () => {
  assert.equal(isBetterDisplayName(null, "Ahmad Fauzi"), false);
});

test("valid existing display name is not overwritten by Unknown", () => {
  assert.equal(isBetterDisplayName("Unknown", "Ahmad Fauzi"), false);
});

test("WhatsApp account label is blocked as a contact display name", () => {
  assert.equal(isBlockedDisplayName("Main Sales", ["Main Sales"]), true);
  assert.equal(sanitizeWhatsAppDisplayName("Main Sales", ["Main Sales"]), null);
});

test("weak existing name can be replaced by a valid WhatsApp name", () => {
  assert.equal(isBetterDisplayName("Ahmad Fauzi", "Unknown"), true);
});

test("LID-only incoming identity is marked low quality", () => {
  const result = scoreContactIdentity({
    normalizedPhone: null,
    displayName: "Ahmad Fauzi",
    profileAvatarUrl: null,
    jidType: "lid"
  });

  assert.equal(result.identityQuality, "lid_only");
  assert.equal(result.contactStatus, "needs_phone");
});

test("phone JID is treated as phone verified", () => {
  const result = scoreContactIdentity({
    normalizedPhone: "+60123456789",
    displayName: "Ahmad Fauzi",
    profileAvatarUrl: null,
    jidType: "phone"
  });

  assert.equal(result.identityQuality, "phone_verified");
  assert.equal(result.contactStatus, "resolved");
});

test("avatar without phone is routed to needs_phone", () => {
  const result = scoreContactIdentity({
    normalizedPhone: null,
    displayName: "Ahmad Fauzi",
    profileAvatarUrl: "https://example.test/avatar.jpg",
    jidType: "unknown"
  });

  assert.equal(result.contactStatus, "needs_phone");
});

test("generic metadata names are weak", () => {
  assert.equal(isWeakDisplayName("Customer 123"), true);
  assert.equal(isWeakDisplayName("iPhone"), true);
  assert.equal(isWeakDisplayName("Ahmad Fauzi"), false);
});
