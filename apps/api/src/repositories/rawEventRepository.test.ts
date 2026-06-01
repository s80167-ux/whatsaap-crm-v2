import assert from "node:assert/strict";
import test from "node:test";

import { RawEventRepository } from "./rawEventRepository.js";

test("claimTransientRecoveryBatch targets only exhausted transient failures after cooldown", async () => {
  const repository = new RawEventRepository();
  let capturedSql = "";
  let capturedValues: unknown[] = [];

  const client = {
    query: async <T>(sql: string, values?: unknown[]) => {
      capturedSql = sql;
      capturedValues = values ?? [];
      return { rows: [] as T[] };
    }
  } as any;

  await repository.claimTransientRecoveryBatch(client, 25, 10, new Date("2026-06-01T08:00:00.000Z"));

  assert.match(capturedSql, /processing_status = 'failed'/);
  assert.match(capturedSql, /retry_count >= \$2/);
  assert.match(capturedSql, /coalesce\(last_attempt_at, received_at\) < \$3/);
  assert.match(capturedSql, /timeout exceeded when trying to connect/);
  assert.deepEqual(capturedValues, [25, 10, "2026-06-01T08:00:00.000Z"]);
});