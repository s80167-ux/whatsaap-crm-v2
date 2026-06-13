import test from "node:test";
import assert from "node:assert/strict";
import { ConnectorCommandService } from "./connectorCommandService.js";

test("manual reconnect forwards blocked reconnect confirmation only after user action", async () => {
  const calls: Array<{ allowBlockedReconnect?: boolean }> = [];
  const service = new ConnectorCommandService(
    {
      findById: async () => ({
        id: "account-1",
        organization_id: "org-1",
        label: "Suspected Number",
        account_phone_e164: null,
        account_phone_normalized: null,
        connection_status: "suspected_ban",
        account_jid: null,
        display_name: "Suspected Number"
      })
    } as never,
    {
      reconnectSession: async (_account: unknown, options?: { allowBlockedReconnect?: boolean }) => {
        calls.push({ allowBlockedReconnect: options?.allowBlockedReconnect });
      },
      isConnected: () => false
    } as never
  );

  await service.reconnectAccount("account-1");
  await service.reconnectAccount("account-1", { allowBlockedReconnect: true });

  assert.deepEqual(calls, [{ allowBlockedReconnect: undefined }, { allowBlockedReconnect: true }]);
});

test("suspected ban status is preserved when live socket is not connected", async () => {
  const updateCalls: string[] = [];
  const service = new ConnectorCommandService(
    {
      findById: async () => ({
        id: "account-1",
        organization_id: "org-1",
        label: "Suspected Number",
        account_phone_e164: null,
        account_phone_normalized: null,
        connection_status: "suspected_ban",
        account_jid: null,
        display_name: "Suspected Number"
      }),
      updateStatus: async (_client: unknown, _accountId: string, status: string) => {
        updateCalls.push(status);
      }
    } as never,
    {
      isConnected: () => false
    } as never
  );

  const result = await service.getAccountStatus("account-1");

  assert.equal(result.connectionStatus, "suspected_ban");
  assert.deepEqual(updateCalls, []);
});
