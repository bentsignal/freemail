/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MutationCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import schema from "../schema";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");
const OWNER = "owner";
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(insertThread);
  return { ...ids, owner: t.withIdentity({ subject: OWNER }), t };
}

async function insertThread(ctx: MutationCtx) {
  const accountId = await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider: "hosted",
    remoteAccountId: "me@example.com",
    address: "me@example.com",
    status: "connected",
    createdAt: 1,
    updatedAt: 1,
  });
  const threadId = await ctx.db.insert("threads", {
    ownerId: OWNER,
    accountId,
    remoteThreadId: "thread-1",
    subject: "Plans",
    snippet: "Plans",
    participants: [],
    latestMessageAt: 100,
    latestInboxMessageAt: 100,
    messageCount: 1,
    unreadCount: 0,
    inInbox: true,
    isPinned: false,
    hasAttachments: false,
    createdAt: 100,
    updatedAt: 100,
  });
  const messageId = await ctx.db.insert("messages", {
    ownerId: OWNER,
    accountId,
    threadId,
    remoteMessageId: "message-1",
    internetMessageId: "<message-1@example.com>",
    direction: "incoming",
    from: { address: "maya@example.com" },
    to: [{ address: "me@example.com" }],
    cc: [],
    bcc: [],
    subject: "Plans",
    snippet: "Plans",
    searchText: "Plans",
    remoteLabelIds: [],
    bodyState: "available",
    sentAt: 100,
    receivedAt: 100,
    hasAttachments: false,
    inInbox: true,
    isRead: true,
    isPinned: false,
    createdAt: 100,
    updatedAt: 100,
  });
  const attachmentId = await ctx.db.insert("draftAttachments", {
    ownerId: OWNER,
    fileName: "plan.pdf",
    contentType: "application/pdf",
    declaredSize: 10,
    size: 10,
    status: "ready",
    createdAt: 0,
    updatedAt: 0,
  });
  return { accountId, attachmentId, messageId, threadId };
}

function draft(
  threadId: Awaited<ReturnType<typeof setup>>["threadId"],
  body: string,
  updatedAt: number,
) {
  return {
    attachmentIds: [],
    bcc: "",
    body,
    cc: "",
    subject: "Re: Plans",
    threadId,
    to: "maya@example.com",
    updatedAt,
  };
}

describe("reply drafts", () => {
  it("keeps the newest edit", async () => {
    const { owner, threadId } = await setup();
    await owner.mutation(
      api.replyDrafts.mutations.save,
      draft(threadId, "phone", 2),
    );
    const stale = await owner.mutation(
      api.replyDrafts.mutations.save,
      draft(threadId, "older laptop edit", 1),
    );
    expect(stale).toEqual({ updatedAt: 2 });
    await owner.mutation(
      api.replyDrafts.mutations.save,
      draft(threadId, "laptop", 3),
    );
    const drafts = await owner.query(api.replyDrafts.queries.list, {});
    expect(drafts.map((row) => [row.body, row.updatedAt])).toEqual([
      ["laptop", 3],
    ]);
  });

  it("deletes a draft unless it was edited afterwards", async () => {
    const { owner, threadId } = await setup();
    await owner.mutation(
      api.replyDrafts.mutations.save,
      draft(threadId, "phone", 5),
    );
    await owner.mutation(api.replyDrafts.mutations.remove, {
      deletedAt: 4,
      threadId,
    });
    expect(await owner.query(api.replyDrafts.queries.list, {})).toHaveLength(1);
    await owner.mutation(api.replyDrafts.mutations.remove, {
      deletedAt: 6,
      threadId,
    });
    expect(await owner.query(api.replyDrafts.queries.list, {})).toEqual([]);
  });

  it("is deleted when the reply is sent", async () => {
    const { accountId, messageId, owner, threadId } = await setup();
    await owner.mutation(
      api.replyDrafts.mutations.save,
      draft(threadId, "On my way", 1),
    );
    await owner.mutation(api.mail.mutations.enqueuePlainText, {
      accountId,
      idempotencyKey: "freemail-test-send-1",
      plainText: "On my way",
      replyToMessageId: messageId,
      subject: "Re: Plans",
      to: [{ address: "maya@example.com" }],
    });
    expect(await owner.query(api.replyDrafts.queries.list, {})).toEqual([]);
  });

  it("holds its attachments past the unsent upload expiry", async () => {
    const { attachmentId, owner, t, threadId } = await setup();
    await owner.mutation(api.replyDrafts.mutations.save, {
      ...draft(threadId, "See attached", 1),
      attachmentIds: [attachmentId],
    });
    vi.setSystemTime(2 * DAY_MS);
    await t.mutation(internal.attachments.internal.cleanupExpiredDrafts, {});
    const drafts = await owner.query(api.replyDrafts.queries.list, {});
    expect(
      drafts.flatMap((row) => row.attachments.map((item) => item.fileName)),
    ).toEqual(["plan.pdf"]);

    await owner.mutation(api.replyDrafts.mutations.remove, {
      deletedAt: 2,
      threadId,
    });
    await t.mutation(internal.attachments.internal.cleanupExpiredDrafts, {});
    expect(await t.run((ctx) => ctx.db.get(attachmentId))).toBeNull();
  });
});
