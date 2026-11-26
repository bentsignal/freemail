/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import type { AgentScope } from "@freemail/agent-contract";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { createAgentToken, hashAgentToken } from "./token";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");
const OWNER = "owner";
const ALL_SCOPES = [
  "accounts:read",
  "mail:search",
  "threads:read",
  "mail:unread",
] satisfies AgentScope[];

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function insertAccount(ctx: MutationCtx, address: string) {
  return await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider: "gmail",
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
    at,
    isRead = false,
    isSpam = false,
  }: { at: number; isRead?: boolean; isSpam?: boolean },
) {
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
    unreadCount: isRead ? 0 : 1,
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
    direction: "incoming",
    from: { address: "sender@example.com", name: "Sender" },
    to: [],
    cc: [],
    bcc: [],
    subject,
    snippet: `${subject} snippet`,
    searchText: subject,
    bodyState: "available",
    receivedAt: at,
    hasAttachments: false,
    inInbox: true,
    isRead,
    isPinned: false,
    createdAt: at,
    updatedAt: at,
  });
  await ctx.db.patch(threadId, { latestInboxMessageId: messageId });
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
  return threadId;
}

async function seed(
  t: ReturnType<typeof setup>,
  {
    scopes = ALL_SCOPES,
    revoked = false,
  }: { scopes?: AgentScope[]; revoked?: boolean } = {},
) {
  const token = createAgentToken();
  const tokenHash = await hashAgentToken(token);
  const ids = await t.run(async (ctx) => {
    const accountId = await insertAccount(ctx, "owner@example.com");
    const older = await insertThread(ctx, accountId, "Older unread", {
      at: 100,
    });
    const newer = await insertThread(ctx, accountId, "Newer unread", {
      at: 200,
    });
    await insertThread(ctx, accountId, "Already read", {
      at: 300,
      isRead: true,
    });
    await insertThread(ctx, accountId, "Spam", { at: 400, isSpam: true });
    await ctx.db.insert("agentCredentials", {
      ownerId: OWNER,
      label: "Vera",
      tokenHash,
      scopes,
      accountAccess: { mode: "all" },
      expiresAt: Date.now() + 60_000,
      revokedAt: revoked ? Date.now() : undefined,
      createdAt: 1,
      updatedAt: 1,
    });
    return { accountId, newer, older };
  });
  return { ...ids, token };
}

async function callTool(
  t: ReturnType<typeof setup>,
  token: string,
  tool: string,
  args: unknown = {},
) {
  return await t.fetch("/agent/v1/tools", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tool, arguments: args, requestId: "test" }),
  });
}

describe("agent token endpoint", () => {
  it("lists the inbox's unread conversations, newest first, without marking them read", async () => {
    const t = setup();
    const { newer, older, token } = await seed(t);

    const response = await callTool(t, token, "list_unread");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      totalUnreadThreads: 2,
      threads: [
        {
          threadId: newer,
          subject: "Newer unread",
          from: { address: "sender@example.com", name: "Sender" },
          unreadCount: 1,
        },
        { threadId: older, subject: "Older unread" },
      ],
    });
    const unread = await t.run(async (ctx) =>
      (await ctx.db.query("messages").collect())
        .filter((message) => !message.isRead)
        .map((message) => message.subject)
        .sort(),
    );
    expect(unread).toEqual(["Newer unread", "Older unread", "Spam"]);
  });

  it("reads a thread without changing its read state", async () => {
    const t = setup();
    const { newer, token } = await seed(t);

    const response = await callTool(t, token, "get_thread", {
      threadId: newer,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ thread: { id: newer } });
    const thread = await t.run(async (ctx) => await ctx.db.get(newer));
    expect(thread?.unreadCount).toBe(1);
  });

  it("honors the limit and reports the full count", async () => {
    const t = setup();
    const { newer, token } = await seed(t);

    const response = await callTool(t, token, "list_unread", { limit: 1 });

    expect(await response.json()).toMatchObject({
      totalUnreadThreads: 2,
      threads: [{ threadId: newer }],
    });
  });

  it("refuses a tool the credential has no scope for", async () => {
    const t = setup();
    const { token } = await seed(t, { scopes: ["threads:read"] });

    const response = await callTool(t, token, "list_unread");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "INSUFFICIENT_SCOPE" },
    });
  });

  it.each(["mark_read", "send_mail", "archive_thread", "delete_message"])(
    "has no %s tool",
    async (tool) => {
      const t = setup();
      const { token } = await seed(t);

      const response = await callTool(t, token, tool);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_TOOL" },
      });
    },
  );

  it("refuses revoked and unknown tokens", async () => {
    const t = setup();
    const { token } = await seed(t, { revoked: true });

    expect((await callTool(t, token, "list_unread")).status).toBe(401);
    expect((await callTool(t, createAgentToken(), "list_unread")).status).toBe(
      401,
    );
  });
});
