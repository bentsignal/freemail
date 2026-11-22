/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import schema from "../schema";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");
const OWNER = "owner";
const page = { paginationOpts: { cursor: null, numItems: 10 } };

function setup() {
  const t = convexTest(schema, modules);
  return { t, owner: t.withIdentity({ subject: OWNER }) };
}

async function insertAccount(ctx: MutationCtx, deletingAt?: number) {
  return await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider: "gmail",
    remoteAccountId: `account-${deletingAt ?? "active"}`,
    address: "me@example.com",
    status: "connected",
    createdAt: 1,
    updatedAt: 1,
    ...(deletingAt === undefined ? {} : { deletingAt }),
  });
}

/**
 * An unread inbox thread of one message. `projected` fills the thread's
 * inbox projection as provider sync does; without it the thread is one from
 * before the projection.
 */
async function insertThread(
  ctx: MutationCtx,
  accountId: Id<"mailAccounts">,
  subject: string,
  { isSpam = false, projected = true } = {},
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
    latestInboxMessageAt: at,
    messageCount: 1,
    unreadCount: 1,
    inInbox: true,
    isPinned: false,
    hasAttachments: false,
    createdAt: at,
    updatedAt: at,
  });
  const messageId = await ctx.db.insert("messages", {
    ownerId: OWNER,
    accountId,
    threadId,
    remoteMessageId: subject,
    internetMessageId: `<${subject}@example.com>`,
    direction: "incoming",
    from: { address: "sender@example.com", name: "Sender" },
    to: [{ address: "me@example.com" }],
    cc: [{ address: "cc@example.com" }],
    bcc: [],
    subject,
    snippet: `${subject} snippet`,
    searchText: `${subject} sender@example.com`,
    headers: [{ name: "Received", value: "from example.com" }],
    remoteLabelIds: ["INBOX", "UNREAD"],
    bodyState: "available",
    sentAt: at,
    receivedAt: at,
    hasAttachments: false,
    inInbox: true,
    isRead: false,
    isPinned: false,
    createdAt: at,
    updatedAt: at,
  });
  if (projected) {
    await ctx.db.patch(threadId, { latestInboxMessageId: messageId });
  }
  await ctx.db.insert("messageClassifications", {
    ownerId: OWNER,
    messageId,
    status: "classified",
    category: isSpam ? "noise" : "personal",
    importance: 0.5,
    confidence: 1,
    reason: "seed",
    summary: `${subject} summary`,
    cleanedMarkdown: "a long cleaned body",
    shouldEmbed: false,
    ...(isSpam ? { isSpam: true } : {}),
    source: "seed",
    promptVersion: "test",
    createdAt: at,
    updatedAt: at,
  });
  return threadId;
}

it("sends inbox rows without headers, recipients, or the classifier's record", async () => {
  const { t, owner } = setup();
  await t.run(async (ctx) => {
    const accountId = await insertAccount(ctx);
    await insertThread(ctx, accountId, "hello");
  });

  const { page: rows } = await owner.query(api.mail.queries.listInbox, page);

  expect(rows).toHaveLength(1);
  const row = rows.at(0);
  expect(row).toMatchObject({
    account: { address: "me@example.com", provider: "gmail" },
    classification: { category: "personal", summary: "hello summary" },
    from: { address: "sender@example.com", name: "Sender" },
    isRead: false,
    location: { kind: "inbox" },
    snippet: "hello snippet",
    subject: "hello",
  });
  for (const field of [
    "bcc",
    "cc",
    "headers",
    "internetMessageId",
    "ownerId",
    "remoteLabelIds",
    "searchText",
    "to",
  ]) {
    expect(row).not.toHaveProperty(field);
  }
  expect(row?.classification).not.toHaveProperty("cleanedMarkdown");
  expect(row?.classification).not.toHaveProperty("reason");
});

it("counts unread threads as the inbox shows them, spam and removed accounts left out", async () => {
  const { t, owner } = setup();
  const accountId = await t.run(async (ctx) => {
    const active = await insertAccount(ctx);
    const removed = await insertAccount(ctx, 5);
    await insertThread(ctx, active, "projected");
    await insertThread(ctx, active, "legacy", { projected: false });
    await insertThread(ctx, active, "projected spam", { isSpam: true });
    await insertThread(ctx, active, "legacy spam", {
      isSpam: true,
      projected: false,
    });
    await insertThread(ctx, removed, "removed account");
    return active;
  });

  expect(await owner.query(api.mail.queries.getUnreadCounts, {})).toEqual({
    all: 2,
    byAccount: { [accountId]: 2 },
  });
});
