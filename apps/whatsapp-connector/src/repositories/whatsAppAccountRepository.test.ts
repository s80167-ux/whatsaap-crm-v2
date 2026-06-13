import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppAccountRepository } from "./whatsAppAccountRepository.js";

test("listActive excludes blocked reconnect statuses", async () => {
  const repository = new WhatsAppAccountRepository() as any;
  (WhatsAppAccountRepository as any).cachedColumns = {
    name: true,
    label: true,
    display_name: true,
    phone_number: true,
    phone_number_normalized: true,
    account_phone_e164: true,
    account_phone_normalized: true,
    status: true,
    connection_status: true,
    account_jid: true,
    created_at: true,
    last_connected_at: true,
    last_disconnected_at: true,
    last_connection_error_code: true,
    last_connection_error_message: true,
    reconnect_failure_count: true,
    ban_suspected_at: true,
    reconnect_suppressed_at: true,
    connector_owner_id: true,
    connector_claimed_at: true,
    connector_heartbeat_at: true,
    history_sync_lookback_days: true
  };

  let sql = "";
  await repository.listActive({
    query: async (statement: string) => {
      sql = statement;
      return { rows: [] };
    }
  });

  const whereClause = sql.match(/where\s+connection_status\s+in\s*\(([^)]+)\)/i)?.[1] ?? "";

  assert.match(whereClause, /'new', 'qr_required', 'pairing', 'connected', 'reconnecting', 'disconnected', 'error'/);
  assert.doesNotMatch(whereClause, /suspected_ban|reconnect_suppressed|logged_out|banned/);
});
