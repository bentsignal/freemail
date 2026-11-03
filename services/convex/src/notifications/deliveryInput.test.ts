/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");

const stamp = { ownerId: "owner", createdAt: 1, updatedAt: 1 };

async function seedDelivery({
  content,
  includePreview = true,
  snippet = "A note",
}: {
  content?: { plainText?: string; sanitizedHtml?: string };
  includePreview?: boolean;
  snippet?: string;
}) {
  const t = convexTest(schema, modules);
  const deliveryId = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert("mailAccounts", {
      ...stamp,
      provider: "gmail",
      remoteAccountId: "me@example.com",
      address: "me@example.com",
      status: "connected",
    });
    const threadId = await ctx.db.insert("threads", {
      ...stamp,
      accountId,
      remoteThreadId: "thread",
      subject: "Sign in to Acme",
      snippet,
      participants: [{ address: "no-reply@acme.example" }],
      latestMessageAt: 1,
      latestInboxMessageAt: 1,
      messageCount: 1,
      unreadCount: 1,
      inInbox: true,
      isPinned: false,
      hasAttachments: false,
    });
    const messageId = await ctx.db.insert("messages", {
      ...stamp,
      accountId,
      threadId,
      remoteMessageId: "message",
      direction: "incoming",
      from: { address: "no-reply@acme.example" },
      to: [{ address: "me@example.com" }],
      cc: [],
      bcc: [],
      subject: "Sign in to Acme",
      snippet,
      searchText: "sign in to acme",
      bodyState: "available",
      receivedAt: 1,
      hasAttachments: false,
      inInbox: true,
      isRead: false,
      isPinned: false,
    });
    if (content) {
      await ctx.db.insert("messageContents", {
        ...stamp,
        messageId,
        truncated: false,
        ...content,
      });
    }
    await ctx.db.insert("notificationPreferences", {
      ...stamp,
      includePreview,
      newMailEnabled: true,
    });
    return ctx.db.insert("notificationDeliveries", {
      ownerId: "owner",
      messageId,
      status: "ready",
      tokenCount: 0,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return t.query(internal.notifications.internal.getDeliveryInput, {
    deliveryId,
  });
}

describe("verification codes in delivery input", () => {
  it("finds a code in the plain text body", async () => {
    const input = await seedDelivery({
      content: { plainText: "Your verification code is 483920." },
    });
    expect(input?.verificationCode).toBe("483920");
  });

  it("finds a code in an HTML body with an empty plain text part", async () => {
    const input = await seedDelivery({
      content: {
        plainText: "  ",
        sanitizedHtml:
          "<p>Use this code to sign in:</p><p><strong>483920</strong></p>",
      },
    });
    expect(input?.verificationCode).toBe("483920");
  });

  it("falls back to the snippet without stored content", async () => {
    const input = await seedDelivery({
      snippet: "Your login code is 483920",
    });
    expect(input?.verificationCode).toBe("483920");
  });

  it("finds nothing in ordinary mail", async () => {
    const input = await seedDelivery({
      content: { plainText: "Invoice 483920 is ready." },
    });
    expect(input?.verificationCode).toBeUndefined();
  });

  it("doesn't read a code for an account with private previews", async () => {
    const input = await seedDelivery({
      content: { plainText: "Your verification code is 483920." },
      includePreview: false,
    });
    expect(input?.verificationCode).toBeUndefined();
  });
});
