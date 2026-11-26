import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { authedMutation } from "../utils";
import { enqueueOwnedPlainText } from "./enqueue";
import { ensureOwnedMessage, getActiveAccount } from "./helpers";
import { canRetryOutbox, getRetryOutboxUpdate } from "./outbox";
import { scheduleProviderReadUpdate } from "./readUpdates";
import {
  archiveOwnedThread,
  setOwnedThreadPinned,
  setOwnedThreadRead,
} from "./threadMutations";
import { updateThreadInboxProjection } from "./threadState";
import { vMailboxAddress } from "./validators";

export const setPinned = authedMutation({
  args: {
    messageId: v.id("messages"),
    isPinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const message = await ensureOwnedMessage(ctx, ctx.ownerId, args.messageId);
    if (message.isPinned === args.isPinned) return;

    await ctx.db.patch(message._id, {
      isPinned: args.isPinned,
      updatedAt: Date.now(),
    });
    await updateThreadInboxProjection(ctx, message.threadId);
  },
});

export const setRead = authedMutation({
  args: {
    messageId: v.id("messages"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    const message = await ensureOwnedMessage(ctx, ctx.ownerId, args.messageId);
    if (message.isRead === args.isRead) return;

    const thread = await ctx.db.get(message.threadId);
    if (!thread || thread.ownerId !== ctx.ownerId) return;

    const account = await getActiveAccount(ctx, message.accountId);
    const providerUpdate = scheduleProviderReadUpdate({
      ctx,
      ownerId: ctx.ownerId,
      account,
      message,
      isRead: args.isRead,
      delay: 0,
    });

    await Promise.all([
      ctx.db.patch(message._id, {
        isRead: args.isRead,
        updatedAt: Date.now(),
      }),
      ctx.db.patch(thread._id, {
        unreadCount: Math.max(0, thread.unreadCount + (args.isRead ? -1 : 1)),
        updatedAt: Date.now(),
      }),
      ...(providerUpdate ? [providerUpdate] : []),
    ]);
  },
});

export const setThreadPinned = authedMutation({
  args: {
    threadId: v.id("threads"),
    isPinned: v.boolean(),
  },
  handler: async (ctx, args) =>
    await setOwnedThreadPinned(ctx, ctx.ownerId, args.threadId, args.isPinned),
});

export const setThreadRead = authedMutation({
  args: {
    threadId: v.id("threads"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    await setOwnedThreadRead(ctx, {
      isRead: args.isRead,
      ownerId: ctx.ownerId,
      threadId: args.threadId,
    });
  },
});

export const archiveThread = authedMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) =>
    await archiveOwnedThread(ctx, ctx.ownerId, args.threadId),
});

export const removeThreadFromRodge = authedMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) =>
    await archiveOwnedThread(ctx, ctx.ownerId, args.threadId),
});

export const enqueuePlainText = authedMutation({
  args: {
    accountId: v.id("mailAccounts"),
    idempotencyKey: v.string(),
    to: v.array(vMailboxAddress),
    cc: v.optional(v.array(vMailboxAddress)),
    bcc: v.optional(v.array(vMailboxAddress)),
    subject: v.string(),
    plainText: v.string(),
    replyToMessageId: v.optional(v.id("messages")),
    attachmentIds: v.optional(v.array(v.id("draftAttachments"))),
  },
  handler: async (ctx, args) => await enqueueOwnedPlainText(ctx, args),
});

export const retryOutbox = authedMutation({
  args: { outboxId: v.id("outboxMessages") },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (!outbox || outbox.ownerId !== ctx.ownerId) {
      throw new ConvexError("Outbox message not found");
    }
    if (!canRetryOutbox(outbox)) {
      return { retried: false, status: outbox.status } as const;
    }
    await ctx.db.patch(outbox._id, getRetryOutboxUpdate(Date.now()));
    await ctx.scheduler.runAfter(
      0,
      internal.sync.internal.deliverProviderOutbox,
      { outboxId: outbox._id },
    );
    return { retried: true, status: "pending" } as const;
  },
});
