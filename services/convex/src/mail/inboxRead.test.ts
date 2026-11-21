/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import schema from "../schema";
import {
  MARK_INBOX_READ_BATCH_SIZE,
  MARK_INBOX_READ_PROVIDER_STEP_MS,
} from "./inboxRead";

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
  provider: "gmail" | "hosted",
  address: string,
) {
  return await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider,
    remoteAccountId: address,
    address,
    status: "connected",
    createdAt: 1,
    updatedAt: 1,
  });
}

async function insertThread(
  ctx: MutationCtx,
  accountId: Id<"mailAccounts">,
  subject: string,
  {
    inInbox = true,
    isSpam = false,
    unreadMessages = 1,
  }: { inInbox?: boolean; isSpam?: boolean; unreadMessages?: number } = {},
) {
  const at = 100;
  const threadId = await ctx.db.insert("threads", {
    ownerId: OWNER,
    accountId,
    remoteThreadId: subject,
    subject,
    snippet: subject,
    participants: [],
    latestMessageAt: at,
    latestInboxMessageAt: inInbox ? at : undefined,
    messageCount: unreadMessages,
    unreadCount: unreadMessages,
    inInbox,
    isPinned: false,
    hasAttachments: false,
    createdAt: at,
    updatedAt: at,
  });
  for (let index = 0; index < unreadMessages; index += 1) {
    const messageId = await ctx.db.insert("messages", {
      ownerId: OWNER,
      accountId,
      threadId,
      remoteMessageId: `${subject}-${index}`,
      internetMessageId: `<${subject}-${index}@example.com>`,
      direction: "incoming",
      from: { address: "sender@example.com" },
      to: [],
      cc: [],
      bcc: [],
      subject,
      snippet: subject,
      searchText: subject,
      remoteLabelIds: [],
      bodyState: "available",
      sentAt: at + index,
      receivedAt: at + index,
      hasAttachments: false,
      inInbox,
      isRead: false,
      isPinned: false,
      createdAt: at,
      updatedAt: at,
    });
    if (isSpam) {
      await ctx.db.insert("messageClassifications", {
        ownerId: OWNER,
        messageId,
        status: "classified",
        category: "noise",
        importance: 0,
        confidence: 1,
        reason: "seed",
        summary: subject,
        shouldEmbed: false,
        isSpam: true,
        source: "seed",
        promptVersion: "test",
        createdAt: at,
        updatedAt: at,
      });
    }
  }
  return threadId;
}

async function unreadCounts(t: ReturnType<typeof setup>["t"]) {
  return await t.run(async (ctx) => {
    const threads = await ctx.db.query("threads").collect();
    const messages = await ctx.db.query("messages").collect();
    return Object.fromEntries(
      threads.map((thread) => [
        thread.subject,
        {
          thread: thread.unreadCount,
          messages: messages.filter(
            (message) => message.threadId === thread._id && !message.isRead,
          ).length,
        },
      ]),
    );
  });
}

it("marks every unread inbox conversation read and leaves spam and archive alone", async () => {
  const { t, owner } = setup();
  await t.run(async (ctx) => {
    const first = await insertAccount(ctx, "hosted", "first@example.com");
    const second = await insertAccount(ctx, "hosted", "second@example.com");
    await insertThread(ctx, first, "inbox one", { unreadMessages: 2 });
    await insertThread(ctx, second, "inbox two");
    await insertThread(ctx, first, "archived", { inInbox: false });
    await insertThread(ctx, first, "spam", { isSpam: true });
  });

  await expect(
    owner.mutation(api.mail.inboxRead.markInboxRead, {}),
  ).resolves.toEqual({ threads: 2 });

  expect(await unreadCounts(t)).toEqual({
    "inbox one": { thread: 0, messages: 0 },
    "inbox two": { thread: 0, messages: 0 },
    archived: { thread: 1, messages: 1 },
    spam: { thread: 1, messages: 1 },
  });
  await expect(
    owner.query(api.mail.queries.getUnreadCounts, {}),
  ).resolves.toEqual({ all: 0, byAccount: {} });
});

it("marks only the chosen account's inbox read", async () => {
  const { t, owner } = setup();
  const first = await t.run(async (ctx) => {
    const first = await insertAccount(ctx, "hosted", "first@example.com");
    const second = await insertAccount(ctx, "hosted", "second@example.com");
    await insertThread(ctx, first, "first");
    await insertThread(ctx, second, "second");
    return first;
  });

  await owner.mutation(api.mail.inboxRead.markInboxRead, {
    accountId: first,
  });

  expect(await unreadCounts(t)).toEqual({
    first: { thread: 0, messages: 0 },
    second: { thread: 1, messages: 1 },
  });
});

it("finishes a large inbox in scheduled batches", async () => {
  const { t, owner } = setup();
  const total = MARK_INBOX_READ_BATCH_SIZE * 2 + 5;
  await t.run(async (ctx) => {
    const account = await insertAccount(ctx, "hosted", "a@example.com");
    for (let index = 0; index < total; index += 1) {
      await insertThread(ctx, account, `thread ${index}`);
    }
  });

  await owner.mutation(api.mail.inboxRead.markInboxRead, {});
  const afterFirstBatch = Object.values(await unreadCounts(t)).filter(
    (count) => count.thread > 0,
  );
  expect(afterFirstBatch).toHaveLength(total - MARK_INBOX_READ_BATCH_SIZE);

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const remaining = Object.values(await unreadCounts(t)).filter(
    (count) => count.thread > 0,
  );
  expect(remaining).toHaveLength(0);
});

it("paces provider writes across conversations", async () => {
  const { t, owner } = setup();
  await t.run(async (ctx) => {
    const account = await insertAccount(ctx, "gmail", "g@example.com");
    await insertThread(ctx, account, "one", { unreadMessages: 2 });
    await insertThread(ctx, account, "two");
  });

  await owner.mutation(api.mail.inboxRead.markInboxRead, {});

  const scheduled = await t.run(
    async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
  );
  const times = scheduled
    .filter((job) => job.name.includes("setGmailMessageRead"))
    .map((job) => job.scheduledTime)
    .sort((a, b) => a - b);
  const start = times[0] ?? 0;
  expect(times).toEqual([
    start,
    start + MARK_INBOX_READ_PROVIDER_STEP_MS,
    start + 2 * MARK_INBOX_READ_PROVIDER_STEP_MS,
  ]);
});
