/* eslint-disable func-style, no-restricted-syntax, @typescript-eslint/consistent-type-assertions, @typescript-eslint/require-await, @typescript-eslint/no-empty-function -- A hand-rolled fake client with a virtual clock. */
import { describe, expect, it } from "vitest";

import type { SyncClient } from "./sync.ts";
import { parseCommand } from "./commands.ts";
import { syncMail } from "./sync.ts";

const GMAIL = {
  id: "account1",
  provider: "gmail" as const,
  address: "owner@example.com",
  status: "connected" as const,
  lastSyncedAt: 1,
};

function message(id: string, subject: string, receivedAt: number) {
  return {
    threadId: `thread-${id}`,
    messageId: id,
    from: { address: "no-reply@example.com" },
    subject,
    snippet: "",
    receivedAt,
  };
}

function fakeClient(options: { arriveOnSync: number }) {
  let clock = 1_000_000;
  let syncs = 0;
  let lastSyncedAt = 1;
  const inbox = [message("old", "Older mail", clock - 3_600_000)];
  const page = () =>
    ({ messages: [...inbox] }) as unknown as Awaited<
      ReturnType<SyncClient["listMail"]>
    >;
  const client: SyncClient = {
    listAccounts: async () => ({ accounts: [{ ...GMAIL, lastSyncedAt }] }),
    listMail: async () => page(),
    searchMail: async () => ({ messages: [] }) as never,
    syncAccount: async () => {},
    syncAll: async () => {
      syncs += 1;
      lastSyncedAt = clock + 500;
      if (syncs === options.arriveOnSync) {
        inbox.unshift(message("new", "Your Spotify login code", clock));
      }
    },
  };
  const deps = {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
  return { client, deps, syncCount: () => syncs };
}

describe("mail sync", () => {
  it("parses sync options with sensible defaults", () => {
    expect(parseCommand(["mail", "sync"])).toEqual({
      kind: "mail-sync",
      sinceMinutes: 10,
      timeoutSeconds: 30,
    });
    expect(
      parseCommand([
        "mail",
        "sync",
        "--wait-for",
        "spotify code",
        "--timeout",
        "60",
        "--json",
      ]),
    ).toEqual({
      kind: "mail-sync",
      sinceMinutes: 10,
      timeoutSeconds: 60,
      waitFor: "spotify code",
    });
    expect(() => parseCommand(["mail", "sync", "--timeout", "0"])).toThrow(
      "--timeout",
    );
  });

  it("reports the messages a sync brought in", async () => {
    const { client, deps } = fakeClient({ arriveOnSync: 1 });
    const result = await syncMail(
      client,
      { sinceMinutes: 10, timeoutSeconds: 30 },
      deps,
    );
    expect(result).toMatchObject({ timedOut: false, failed: [] });
    expect(
      "arrived" in result && result.arrived.map((m) => m.messageId),
    ).toEqual(["new"]);
  });

  it("keeps syncing until a matching message arrives", async () => {
    const { client, deps, syncCount } = fakeClient({ arriveOnSync: 3 });
    const result = await syncMail(
      client,
      { sinceMinutes: 10, timeoutSeconds: 120, waitFor: "spotify" },
      deps,
    );
    expect(result).toMatchObject({ found: true, syncs: 3 });
    expect(syncCount()).toBe(3);
  });

  it("times out without a match", async () => {
    const { client, deps } = fakeClient({ arriveOnSync: 0 });
    const result = await syncMail(
      client,
      { sinceMinutes: 10, timeoutSeconds: 20, waitFor: "spotify" },
      deps,
    );
    expect(result).toMatchObject({ found: false, timedOut: true });
  });
});
