import assert from "node:assert/strict";
import test from "node:test";
import { calculateContactQualityScore, isUnknownOrEmptyName, normalizeWhatsAppIdentity } from "./whatsappIdentity.js";

test("normalizeWhatsAppIdentity normalizes phone JID", () => {
  const result = normalizeWhatsAppIdentity("60123456789@s.whatsapp.net");
  assert.equal(result.normalizedJid, "60123456789@s.whatsapp.net");
  assert.equal(result.phoneNumber, "+60123456789");
  assert.equal(result.jidType, "user");
  assert.equal(result.isValidCustomerIdentity, true);
});

test("normalizeWhatsAppIdentity removes device suffix", () => {
  const result = normalizeWhatsAppIdentity("60123456789:12@s.whatsapp.net");
  assert.equal(result.normalizedJid, "60123456789@s.whatsapp.net");
  assert.equal(result.phoneNumber, "+60123456789");
});

test("normalizeWhatsAppIdentity rejects status broadcast", () => {
  const result = normalizeWhatsAppIdentity("status@broadcast");
  assert.equal(result.jidType, "status");
  assert.equal(result.isValidCustomerIdentity, false);
});

test("normalizeWhatsAppIdentity detects groups", () => {
  const result = normalizeWhatsAppIdentity("120363123@g.us");
  assert.equal(result.jidType, "group");
  assert.equal(result.isValidCustomerIdentity, false);
});

test("normalizeWhatsAppIdentity preserves lid", () => {
  const result = normalizeWhatsAppIdentity("123456789@lid");
  assert.equal(result.lid, "123456789@lid");
  assert.equal(result.jidType, "lid");
  assert.equal(result.isValidCustomerIdentity, true);
});

test("normalizeWhatsAppIdentity handles invalid JID", () => {
  const result = normalizeWhatsAppIdentity("");
  assert.equal(result.normalizedJid, null);
  assert.equal(result.jidType, "unknown");
  assert.equal(result.isValidCustomerIdentity, false);
});

test("isUnknownOrEmptyName covers placeholder values", () => {
  assert.equal(isUnknownOrEmptyName(null), true);
  assert.equal(isUnknownOrEmptyName(""), true);
  assert.equal(isUnknownOrEmptyName("Unknown"), true);
  assert.equal(isUnknownOrEmptyName("Unknown Contact"), true);
  assert.equal(isUnknownOrEmptyName("Ahmad"), false);
});

test("calculateContactQualityScore caps at 100", () => {
  const score = calculateContactQualityScore({
    normalizedJid: "60123456789@s.whatsapp.net",
    phoneNumber: "+60123456789",
    lid: "abc@lid",
    pushName: "Ahmad",
    notifyName: "Ahmad",
    verifiedName: "Ahmad Store",
    profilePicUrl: "https://example.test/a.jpg",
    source: "history_sync"
  });
  assert.equal(score, 100);
});
