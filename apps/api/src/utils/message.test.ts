import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMessageType } from "./message.js";

test("normalizeMessageType keeps already-normalized text and media types", () => {
  assert.equal(normalizeMessageType("text"), "text");
  assert.equal(normalizeMessageType("image"), "image");
  assert.equal(normalizeMessageType("video"), "video");
  assert.equal(normalizeMessageType("audio"), "audio");
  assert.equal(normalizeMessageType("document"), "document");
  assert.equal(normalizeMessageType("sticker"), "sticker");
  assert.equal(normalizeMessageType("location"), "location");
  assert.equal(normalizeMessageType("contact"), "contact");
  assert.equal(normalizeMessageType("reaction"), "reaction");
  assert.equal(normalizeMessageType("system"), "system");
});

test("normalizeMessageType still maps raw WhatsApp text payload types", () => {
  assert.equal(normalizeMessageType("conversation"), "text");
  assert.equal(normalizeMessageType("extendedTextMessage"), "text");
  assert.equal(normalizeMessageType("protocolMessage"), "system");
});