import { ConvexError, v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_ATTACHMENT_COUNT } from "../attachments/constants";
import { authedMutation } from "../utils";
import { getDraft } from "./model";

const MAX_BODY_LENGTH = 100_000;
const MAX_FIELD_LENGTH = 10_000;

/**
 * Saves a reply unless the server already has a newer edit of it (from
 * another device). Returns the edit the server keeps, so the caller can
 * tell whether its own was saved.
 */
export const save = authedMutation({
  args: {
    threadId: v.id("threads"),
    accountId: v.optional(v.id("mailAccounts")),
    to: v.string(),
    cc: v.string(),
    bcc: v.string(),
    subject: v.string(),
    body: v.string(),
    attachmentIds: v.array(v.id("draftAttachments")),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    validateLengths(args);
    const thread = await ctx.db.get(args.threadId);
    if (!thread || thread.ownerId !== ctx.ownerId) {
      throw new ConvexError("Thread is unavailable");
    }
    const existing = await getDraft(ctx, ctx.ownerId, args.threadId);
    if (existing && existing.updatedAt >= args.updatedAt) {
      return { updatedAt: existing.updatedAt };
    }
    const draft = {
      ...args,
      accountId: await getOwnedAccountId(ctx, args.accountId),
      attachmentIds: await getHeldAttachmentIds(ctx, args.attachmentIds),
      ownerId: ctx.ownerId,
    };
    if (existing) await ctx.db.replace(existing._id, draft);
    else await ctx.db.insert("replyDrafts", draft);
    return { updatedAt: args.updatedAt };
  },
});

/** Deletes a reply, unless it was edited after the deletion. */
export const remove = authedMutation({
  args: { threadId: v.id("threads"), deletedAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await getDraft(ctx, ctx.ownerId, args.threadId);
    if (existing && existing.updatedAt <= args.deletedAt) {
      await ctx.db.delete(existing._id);
    }
  },
});

function validateLengths(args: {
  attachmentIds: unknown[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  to: string;
}) {
  if (
    args.body.length > MAX_BODY_LENGTH ||
    [args.to, args.cc, args.bcc, args.subject].some(
      (field) => field.length > MAX_FIELD_LENGTH,
    ) ||
    args.attachmentIds.length > MAX_ATTACHMENT_COUNT
  ) {
    throw new ConvexError("Draft is too large to save");
  }
}

async function getOwnedAccountId(
  ctx: MutationCtx & { ownerId: string },
  accountId: Id<"mailAccounts"> | undefined,
) {
  if (!accountId) return undefined;
  const account = await ctx.db.get(accountId);
  return account?.ownerId === ctx.ownerId ? accountId : undefined;
}

/** Only uploaded attachments that are still unsent can be held by a draft. */
async function getHeldAttachmentIds(
  ctx: MutationCtx & { ownerId: string },
  attachmentIds: Id<"draftAttachments">[],
) {
  const attachments = await Promise.all(
    attachmentIds.map((id) => ctx.db.get(id)),
  );
  return attachments.flatMap((attachment) =>
    attachment?.ownerId === ctx.ownerId && attachment.status === "ready"
      ? [attachment._id]
      : [],
  );
}
