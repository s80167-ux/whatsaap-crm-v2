import test from "node:test";
import assert from "node:assert/strict";
import { DisconnectReason } from "baileys";
import { classifyWhatsAppDisconnect } from "./disconnectClassification.js";

test("normal disconnect should auto reconnect", () => {
  const result = classifyWhatsAppDisconnect({
    statusCode: 500,
    errorMessage: "socket hang up",
    hadConnected: true,
    consecutiveReconnectFailures: 0,
    maxConsecutiveReconnectFailures: 5,
    hasExistingCreds: true
  });

  assert.equal(result.classification, "normal_disconnect");
  assert.equal(result.shouldReconnect, true);
});

test("logged out without prior successful connection should not auto reconnect", () => {
  const result = classifyWhatsAppDisconnect({
    statusCode: DisconnectReason.loggedOut,
    errorMessage: "session logged out",
    hadConnected: false,
    consecutiveReconnectFailures: 1,
    maxConsecutiveReconnectFailures: 5,
    hasExistingCreds: true
  });

  assert.equal(result.classification, "logged_out");
  assert.equal(result.shouldReconnect, false);
});

test("repeated reconnect failures should suppress auto reconnect", () => {
  const result = classifyWhatsAppDisconnect({
    statusCode: 500,
    errorMessage: "stream errored out",
    hadConnected: false,
    consecutiveReconnectFailures: 5,
    maxConsecutiveReconnectFailures: 5,
    hasExistingCreds: true
  });

  assert.equal(result.classification, "reconnect_suppressed");
  assert.equal(result.autoReconnectSuppressed, true);
});

test("logged out after a connected session is treated as suspected ban", () => {
  const result = classifyWhatsAppDisconnect({
    statusCode: DisconnectReason.loggedOut,
    errorMessage: "Connection closed",
    hadConnected: true,
    consecutiveReconnectFailures: 0,
    maxConsecutiveReconnectFailures: 5,
    hasExistingCreds: true
  });

  assert.equal(result.classification, "suspected_ban");
  assert.equal(result.suspectedBan, true);
});

test("repeated qr rejection signals suspected ban", () => {
  const result = classifyWhatsAppDisconnect({
    statusCode: DisconnectReason.loggedOut,
    errorMessage: "not authorized",
    hadConnected: false,
    consecutiveReconnectFailures: 2,
    maxConsecutiveReconnectFailures: 5,
    hasExistingCreds: false,
    qrRequiredRecently: true
  });

  assert.equal(result.classification, "suspected_ban");
  assert.equal(result.shouldReconnect, false);
});
