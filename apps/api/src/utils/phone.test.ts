import assert from "node:assert/strict";
import test from "node:test";
import { pickBestPhoneCandidate } from "./phone.js";

test("pickBestPhoneCandidate skips the connected account phone when another payload phone exists", () => {
  const result = pickBestPhoneCandidate(["+60195150233", "+60139835211"], {
    blockedPhones: ["+60195150233"]
  });

  assert.equal(result, "+60139835211");
});

test("pickBestPhoneCandidate returns null when only blocked phones remain", () => {
  const result = pickBestPhoneCandidate(["+60195150233", "0195150233"], {
    blockedPhones: ["+60195150233"]
  });

  assert.equal(result, null);
});