import { ConvexError, v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { AuthedMutationCtx } from "../utils";
import { ARCHIVE_RETENTION_MS } from "../mail/archive";
import { enqueueOwnedPlainText } from "../mail/enqueue";
import { ensureOwnedMessage, isActiveAccount } from "../mail/helpers";
import {
  archiveOwnedThread,
  setOwnedThreadRead,
} from "../mail/threadMutations";
import { authedMutation, authedQuery } from "../utils";

const vAddressList = v.array(v.string());

/**
 * Sends plain text from the owner's account whose address matches `from`, or
 * whose ID it is, through the same outbox as the app's composer.
 */
export const sendMail = authedMutation({
  args: {
    from: v.string(),
    to: vAddressList,
    cc: v.optional(vAddressList),
    bcc: v.optional(vAddressList),
    subject: v.string(),
    body: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await resolveSender(ctx, args.from);
    const result = await enqueueOwnedPlainText(ctx, {
      accountId: account._id,
      bcc: toMailboxes(args.bcc),
      cc: toMailboxes(args.cc),
      idempotencyKey: args.idempotencyKey,
      plainText: args.body,
      subject: args.subject,
      to: toMailboxes(args.to),
    });
    return {
      ...result,
      accountId: account._id,
      from: account.address,
    };
  },
});

export const getSendStatus = authedQuery({
  args: { outboxId: v.id("outboxMessages") },
  handler: async (ctx, args) => {
    const outbox = await ctx.db.get(args.outboxId);
    if (outbox?.ownerId !== ctx.ownerId) return null;
    return {
      outboxId: outbox._id,
      status: outbox.status,
      attempt: outbox.attempt,
      ...(outbox.error ? { error: outbox.error } : {}),
      ...(outbox.sentAt ? { sentAt: outbox.sentAt } : {}),
    };
  },
});

/**
 * Moves a conversation to Freemail's archive, as Archive does in the app. It
 * stays restorable there until cleanup; the provider's copy is unchanged.
 */
export const deleteMail = authedMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const threadId = await resolveThreadId(ctx, args.id);
    const { archivedMessages } = await archiveOwnedThread(
      ctx,
      ctx.ownerId,
      threadId,
    );
    const archivedAt = Date.now();
    return {
      archivedMessages,
      deleted: true,
      mode: "archived",
      restorableUntil: archivedAt + ARCHIVE_RETENTION_MS,
      threadId,
    } as const;
  },
});

export const markRead = authedMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const threadId = await resolveThreadId(ctx, args.id);
    const { changedMessages } = await setOwnedThreadRead(ctx, {
      isRead: true,
      ownerId: ctx.ownerId,
      threadId,
    });
    return { changedMessages, read: true, threadId } as const;
  },
});

async function resolveSender(ctx: AuthedMutationCtx, from: string) {
  const wanted = from.trim().toLowerCase();
  const accounts = (
    await ctx.db
      .query("mailAccounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.ownerId))
      .collect()
  ).filter(isActiveAccount);
  const matches = accounts.filter(
    (account) =>
      account._id === from.trim() || account.address.toLowerCase() === wanted,
  );
  const sendable = matches.filter(canSend);
  if (sendable.length === 1 && sendable[0]) return sendable[0];
  if (sendable.length > 1) {
    throw new ConvexError(
      `More than one account sends as ${from}; pass its account ID instead`,
    );
  }
  if (matches.length > 0) {
    throw new ConvexError(`The account for ${from} cannot send mail right now`);
  }
  const available = accounts
    .filter(canSend)
    .map((account) => account.address)
    .join(", ");
  throw new ConvexError(
    `No connected account sends as ${from}. Accounts that can send: ${available || "none"}`,
  );
}

function canSend(account: Doc<"mailAccounts">) {
  return account.status === "connected" || account.status === "syncing";
}

async function resolveThreadId(ctx: AuthedMutationCtx, id: string) {
  const threadId = ctx.db.normalizeId("threads", id);
  if (threadId) return threadId;
  const messageId = ctx.db.normalizeId("messages", id);
  if (messageId) {
    const message = await ensureOwnedMessage(ctx, ctx.ownerId, messageId);
    return message.threadId;
  }
  throw new ConvexError(`Not a thread or message ID: ${id}`);
}

function toMailboxes(addresses: string[] | undefined) {
  return (addresses ?? []).map((address) => ({ address: address.trim() }));
}
