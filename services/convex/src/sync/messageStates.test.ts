/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");

it("reads only the named messages' read state", async () => {
  const t = convexTest(schema, modules);
  const accountId = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert("mailAccounts", {
      ownerId: "owner",
      provider: "icloud",
      remoteAccountId: "a@icloud.com",
      address: "a@icloud.com",
      status: "connected",
      createdAt: 1,
      updatedAt: 1,
    });
    const threadId = await ctx.db.insert("threads", {
      ownerId: "owner",
      accountId,
      remoteThreadId: "thread",
      subject: "s",
      snippet: "s",
      participants: [],
      latestMessageAt: 1,
      messageCount: 2,
      unreadCount: 1,
      hasAttachments: false,
      createdAt: 1,
      updatedAt: 1,
    });
    for (const [remoteMessageId, isRead] of [
      ["imap:a:1:1", true],
      ["imap:a:1:2", false],
      ["imap:a:1:3", false],
    ] as const) {
      await ctx.db.insert("messages", {
        ownerId: "owner",
        accountId,
        threadId,
        remoteMessageId,
        direction: "incoming",
        from: { address: "b@example.com" },
        to: [],
        cc: [],
        bcc: [],
        subject: "s",
        snippet: "s",
        searchText: "s",
        bodyState: "available",
        receivedAt: 1,
        hasAttachments: false,
        inInbox: true,
        isRead,
        isPinned: false,
        createdAt: 1,
        updatedAt: 1,
      });
    }
    return accountId;
  });

  await expect(
    t.query(internal.sync.internal.getProviderMessageReadStates, {
      ownerId: "owner",
      accountId,
      remoteMessageIds: ["imap:a:1:1", "imap:a:1:2", "imap:a:1:9"],
    }),
  ).resolves.toEqual([
    { remoteMessageId: "imap:a:1:1", isRead: true },
    { remoteMessageId: "imap:a:1:2", isRead: false },
  ]);
  await expect(
    t.query(internal.sync.internal.getProviderMessageReadStates, {
      ownerId: "someone else",
      accountId,
      remoteMessageIds: ["imap:a:1:1"],
    }),
  ).resolves.toEqual([]);
});
