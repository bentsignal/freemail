import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalMutation } from "../functions";
import { authedMutation } from "../utils";
import { ensureListableAccount, getActiveAccount } from "./helpers";
import { readInboxUnreadThreadIds } from "./inboxUnread";
import { getVisibleUnreadInboxThreads } from "./queryEnrichment";
import { setOwnedThreadRead } from "./threadMutations";

export const MARK_INBOX_READ_BATCH_SIZE = 50;
// Each changed message schedules a provider write; stay well under the
// scheduler's per-mutation limit.
export const MARK_INBOX_READ_MESSAGE_BUDGET = 400;
// iCloud opens an IMAP connection per message, so provider writes are paced.
export const MARK_INBOX_READ_PROVIDER_STEP_MS = 250;

/**
 * Marks every unread conversation the inbox shows as read, for one account
 * or all of them. The set is fixed when called, so mail that arrives while
 * later batches run stays unread.
 */
export const markInboxRead = authedMutation({
  args: { accountId: v.optional(v.id("mailAccounts")) },
  handler: async (ctx, args) => {
    if (args.accountId) {
      await ensureListableAccount(ctx, ctx.ownerId, args.accountId);
    }
    const threadIds =
      (await readInboxUnreadThreadIds(ctx, ctx.ownerId, args.accountId)) ??
      (
        await getVisibleUnreadInboxThreads(ctx, ctx.ownerId, args.accountId)
      ).map((thread) => thread._id);
    await markThreadsReadInBatches(ctx, {
      ownerId: ctx.ownerId,
      providerDelay: 0,
      threadIds,
    });
    return { threads: threadIds.length };
  },
});

export const markThreadsReadBatch = internalMutation({
  args: {
    ownerId: v.string(),
    providerDelay: v.number(),
    threadIds: v.array(v.id("threads")),
  },
  handler: async (ctx, args) => {
    await markThreadsReadInBatches(ctx, args);
  },
});

async function markThreadsReadInBatches(
  ctx: MutationCtx,
  {
    ownerId,
    providerDelay,
    threadIds,
  }: {
    ownerId: string;
    providerDelay: number;
    threadIds: Id<"threads">[];
  },
) {
  let delay = providerDelay;
  let changed = 0;
  let next = 0;
  while (
    next < threadIds.length &&
    next < MARK_INBOX_READ_BATCH_SIZE &&
    changed < MARK_INBOX_READ_MESSAGE_BUDGET
  ) {
    const threadId = threadIds[next];
    next += 1;
    if (!threadId) continue;
    const thread = await ctx.db.get(threadId);
    if (
      thread?.ownerId !== ownerId ||
      thread.unreadCount === 0 ||
      !(await getActiveAccount(ctx, thread.accountId))
    ) {
      continue;
    }
    const { changedMessages } = await setOwnedThreadRead(ctx, {
      isRead: true,
      ownerId,
      providerDelay: { start: delay, step: MARK_INBOX_READ_PROVIDER_STEP_MS },
      threadId,
    });
    changed += changedMessages;
    delay += changedMessages * MARK_INBOX_READ_PROVIDER_STEP_MS;
  }
  const remaining = threadIds.slice(next);
  if (remaining.length === 0) return;
  await ctx.scheduler.runAfter(
    0,
    internal.mail.inboxRead.markThreadsReadBatch,
    {
      ownerId,
      providerDelay: delay,
      threadIds: remaining,
    },
  );
}
