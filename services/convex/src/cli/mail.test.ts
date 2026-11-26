/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import schema from "../schema";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");
const OWNER = "owner";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const t = convexTest(schema, modules);
  return { t, owner: t.withIdentity({ subject: OWNER }) };
}

async function insertAccount(
  ctx: MutationCtx,
  address: string,
  {
    provider = "hosted",
    status = "connected",
  }: {
    provider?: "gmail" | "hosted";
    status?: "connected" | "disconnected";
  } = {},
) {
  return await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider,
    remoteAccountId: address,
    address,
    status,
    createdAt: 1,
    updatedAt: 1,
  });
}

async function insertThread(ctx: MutationCtx, accountId: Id<"mailAccounts">) {
  const threadId = await ctx.db.insert("threads", {
    ownerId: OWNER,
    accountId,
    remoteThreadId: "thread",
    subject: "Hello",
    snippet: "Hello",
    participants: [],
    latestMessageAt: 100,
    latestInboxMessageAt: 100,
    messageCount: 2,
    unreadCount: 2,
    inInbox: true,
    isPinned: false,
    hasAttachments: false,
    createdAt: 100,
    updatedAt: 100,
  });
  const messageIds = [];
  for (const index of [0, 1]) {
    messageIds.push(
      await ctx.db.insert("messages", {
        ownerId: OWNER,
        accountId,
        threadId,
        remoteMessageId: `message-${index}`,
        internetMessageId: `<message-${index}@example.com>`,
        direction: "incoming",
        from: { address: "sender@example.com" },
        to: [],
        cc: [],
        bcc: [],
        subject: "Hello",
        snippet: "Hello",
        searchText: "Hello",
        remoteLabelIds: [],
        bodyState: "available",
        sentAt: 100 + index,
        receivedAt: 100 + index,
        hasAttachments: false,
        inInbox: true,
        isRead: false,
        isPinned: false,
        createdAt: 100,
        updatedAt: 100,
      }),
    );
  }
  return { messageIds, threadId };
}

const sendArgs = {
  body: "Testing the CLI.",
  idempotencyKey: "cli-test-key-1",
  subject: "CLI test",
  to: ["friend@example.com"],
};

describe("CLI sendMail", () => {
  it("queues mail on the account matching the from address", async () => {
    const { t, owner } = setup();
    const accountId = await t.run(async (ctx) => {
      await insertAccount(ctx, "other@example.com", { provider: "gmail" });
      return await insertAccount(ctx, "me@example.dev");
    });

    const result = await owner.mutation(api.cli.mail.sendMail, {
      ...sendArgs,
      from: "Me@Example.dev",
    });

    expect(result).toMatchObject({
      accountId,
      from: "me@example.dev",
      reused: false,
      status: "pending",
    });
    const outbox = await t.run(
      async (ctx) => await ctx.db.get(result.outboxId),
    );
    expect(outbox).toMatchObject({
      accountId,
      plainText: "Testing the CLI.",
      subject: "CLI test",
      to: [{ address: "friend@example.com" }],
    });
    expect(
      await owner.query(api.cli.mail.getSendStatus, {
        outboxId: result.outboxId,
      }),
    ).toMatchObject({ status: "pending" });
  });

  it("reuses the outbox row when the same send is retried", async () => {
    const { t, owner } = setup();
    await t.run(async (ctx) => await insertAccount(ctx, "me@example.dev"));
    const first = await owner.mutation(api.cli.mail.sendMail, {
      ...sendArgs,
      from: "me@example.dev",
    });
    const second = await owner.mutation(api.cli.mail.sendMail, {
      ...sendArgs,
      from: "me@example.dev",
    });
    expect(second).toMatchObject({ outboxId: first.outboxId, reused: true });
  });

  it("names the sendable accounts when no account matches", async () => {
    const { t, owner } = setup();
    await t.run(async (ctx) => {
      await insertAccount(ctx, "me@example.dev");
      await insertAccount(ctx, "old@example.dev", { status: "disconnected" });
    });
    await expect(
      owner.mutation(api.cli.mail.sendMail, {
        ...sendArgs,
        from: "nobody@example.dev",
      }),
    ).rejects.toThrow("Accounts that can send: me@example.dev");
    await expect(
      owner.mutation(api.cli.mail.sendMail, {
        ...sendArgs,
        from: "old@example.dev",
      }),
    ).rejects.toThrow("cannot send mail right now");
  });

  it("requires a signed-in owner", async () => {
    const { t } = setup();
    await expect(
      t.mutation(api.cli.mail.sendMail, {
        ...sendArgs,
        from: "me@example.dev",
      }),
    ).rejects.toThrow("Unauthenticated");
  });
});

describe("CLI deleteMail and markRead", () => {
  it("archives the thread for a thread ID", async () => {
    const { t, owner } = setup();
    const { threadId } = await t.run(async (ctx) =>
      insertThread(ctx, await insertAccount(ctx, "me@example.dev")),
    );

    const result = await owner.mutation(api.cli.mail.deleteMail, {
      id: threadId,
    });

    expect(result).toMatchObject({
      archivedMessages: 2,
      deleted: true,
      mode: "archived",
      threadId,
    });
    const thread = await t.run(async (ctx) => await ctx.db.get(threadId));
    expect(thread?.inInbox).toBe(false);
    expect(thread?.archivedAt).toBeDefined();
  });

  it("archives the message's thread for a message ID", async () => {
    const { t, owner } = setup();
    const { messageIds, threadId } = await t.run(async (ctx) =>
      insertThread(ctx, await insertAccount(ctx, "me@example.dev")),
    );
    const result = await owner.mutation(api.cli.mail.deleteMail, {
      id: messageIds[1] ?? "",
    });
    expect(result.threadId).toBe(threadId);
  });

  it("rejects IDs that are neither threads nor messages", async () => {
    const { owner } = setup();
    await expect(
      owner.mutation(api.cli.mail.deleteMail, { id: "not-an-id" }),
    ).rejects.toThrow("Not a thread or message ID");
  });

  it("marks every message in the thread read", async () => {
    const { t, owner } = setup();
    const { threadId } = await t.run(async (ctx) =>
      insertThread(ctx, await insertAccount(ctx, "me@example.dev")),
    );
    const result = await owner.mutation(api.cli.mail.markRead, {
      id: threadId,
    });
    expect(result).toEqual({ changedMessages: 2, read: true, threadId });
    const unread = await t.run(async (ctx) =>
      (await ctx.db.query("messages").collect()).filter(
        (message) => !message.isRead,
      ),
    );
    expect(unread).toHaveLength(0);
  });
});
