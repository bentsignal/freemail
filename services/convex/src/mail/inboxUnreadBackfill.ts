import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalMutation } from "../functions";
import {
  markInboxUnreadCountsReady,
  refreshInboxUnreadThread,
} from "./inboxUnread";

const BACKFILL_BATCH_SIZE = 50;

const vPhase = v.union(v.literal("threads"), v.literal("entries"));

/**
 * Counts every unread thread into `inboxUnreadThreads` and
 * `inboxUnreadCounts`, then marks the counters ready. Without an owner it
 * starts one run per owner. It also clears entries for threads that no
 * longer count, so running it again repairs the counters.
 */
export const backfill = internalMutation({
  args: {
    ownerId: v.optional(v.string()),
    phase: v.optional(vPhase),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { ownerId } = args;
    if (ownerId === undefined) return await startOwnerBackfills(ctx);
    const phase = args.phase ?? "threads";
    const page = await readThreadIds(ctx, ownerId, phase, args.cursor ?? null);
    for (const threadId of page.threadIds) {
      await refreshInboxUnreadThread(ctx, threadId);
    }
    const next = !page.isDone
      ? { ownerId, phase, cursor: page.continueCursor }
      : phase === "threads"
        ? { ownerId, phase: "entries" as const, cursor: null }
        : null;
    if (next) {
      await ctx.scheduler.runAfter(
        0,
        internal.mail.inboxUnreadBackfill.backfill,
        next,
      );
    } else {
      await markInboxUnreadCountsReady(ctx, ownerId);
    }
    return { owners: 1 };
  },
});

async function startOwnerBackfills(ctx: MutationCtx) {
  const accounts = await ctx.db.query("mailAccounts").collect();
  const owners = new Set(accounts.map((account) => account.ownerId));
  for (const ownerId of owners) {
    await ctx.scheduler.runAfter(
      0,
      internal.mail.inboxUnreadBackfill.backfill,
      { ownerId },
    );
  }
  return { owners: owners.size };
}

async function readThreadIds(
  ctx: MutationCtx,
  ownerId: string,
  phase: Infer<typeof vPhase>,
  cursor: string | null,
) {
  const paginationOpts = { cursor, numItems: BACKFILL_BATCH_SIZE };
  if (phase === "threads") {
    const page = await ctx.db
      .query("threads")
      .withIndex("by_owner_unread", (q) =>
        q.eq("ownerId", ownerId).gt("unreadCount", 0),
      )
      .paginate(paginationOpts);
    return { ...page, threadIds: page.page.map((thread) => thread._id) };
  }
  const page = await ctx.db
    .query("inboxUnreadThreads")
    .withIndex("by_owner_account", (q) => q.eq("ownerId", ownerId))
    .paginate(paginationOpts);
  return { ...page, threadIds: page.page.map((entry) => entry.threadId) };
}
