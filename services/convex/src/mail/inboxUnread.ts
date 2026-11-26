import type { Triggers } from "convex-helpers/server/triggers";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getClassificationForMessage,
  getLatestInboxMessage,
  isActiveAccount,
} from "./helpers";

type ReadCtx = Pick<QueryCtx, "db">;
type WriteCtx = Pick<MutationCtx, "db">;

/**
 * Whether the inbox shows the thread as unread: it has unread mail, a
 * message in the inbox, and that message isn't spam. Only that message's
 * classification is read; the thread's projection names the message
 * (INBOX.md), and threads from before it read the message too.
 */
export async function countsAsUnreadInboxThread(
  ctx: ReadCtx,
  thread: Doc<"threads">,
) {
  if (thread.inInbox === false || thread.unreadCount <= 0) return false;
  const messageId =
    thread.inInbox === true && thread.latestInboxMessageId
      ? thread.latestInboxMessageId
      : (await getLatestInboxMessage(ctx, thread))?._id;
  if (!messageId) return false;
  const classification = await getClassificationForMessage(ctx, messageId);
  return classification?.isSpam !== true;
}

/**
 * Brings the thread's `inboxUnreadThreads` entry, and its account's count,
 * in line with what the thread is now. Safe to call any number of times.
 */
export async function refreshInboxUnreadThread(
  ctx: WriteCtx,
  threadId: Id<"threads">,
) {
  const [thread, entry] = await Promise.all([
    ctx.db.get(threadId),
    ctx.db
      .query("inboxUnreadThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique(),
  ]);
  const counts =
    thread !== null && (await countsAsUnreadInboxThread(ctx, thread));
  if (counts === (entry !== null)) return;
  if (thread && counts) {
    await ctx.db.insert("inboxUnreadThreads", {
      ownerId: thread.ownerId,
      accountId: thread.accountId,
      threadId,
    });
    await adjustCount(ctx, thread.ownerId, thread.accountId, 1);
  } else if (entry) {
    await ctx.db.delete(entry._id);
    await adjustCount(ctx, entry.ownerId, entry.accountId, -1);
  }
}

async function adjustCount(
  ctx: WriteCtx,
  ownerId: string,
  accountId: Id<"mailAccounts">,
  delta: number,
) {
  const counts = await getCountsDocument(ctx, ownerId);
  const now = Date.now();
  if (!counts) {
    await ctx.db.insert("inboxUnreadCounts", {
      ownerId,
      byAccount: delta > 0 ? { [accountId]: delta } : {},
      updatedAt: now,
    });
    return;
  }
  const byAccount = { ...counts.byAccount };
  const next = Math.max(0, (byAccount[accountId] ?? 0) + delta);
  if (next === 0) delete byAccount[accountId];
  else byAccount[accountId] = next;
  await ctx.db.patch(counts._id, { byAccount, updatedAt: now });
}

async function getCountsDocument(ctx: ReadCtx, ownerId: string) {
  return await ctx.db
    .query("inboxUnreadCounts")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}

export async function markInboxUnreadCountsReady(
  ctx: WriteCtx,
  ownerId: string,
) {
  const counts = await getCountsDocument(ctx, ownerId);
  const now = Date.now();
  if (counts) await ctx.db.patch(counts._id, { readyAt: now, updatedAt: now });
  else {
    await ctx.db.insert("inboxUnreadCounts", {
      ownerId,
      byAccount: {},
      readyAt: now,
      updatedAt: now,
    });
  }
}

async function getActiveAccountIds(ctx: ReadCtx, ownerId: string) {
  const accounts = await ctx.db
    .query("mailAccounts")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  return new Set<string>(
    accounts.filter(isActiveAccount).map((account) => account._id),
  );
}

/**
 * The unread counts from the stored counters, or null until they have been
 * backfilled (`mail/inboxUnreadBackfill:backfill`).
 */
export async function readInboxUnreadCounts(ctx: ReadCtx, ownerId: string) {
  const counts = await getCountsDocument(ctx, ownerId);
  if (counts?.readyAt === undefined) return null;
  const activeAccountIds = await getActiveAccountIds(ctx, ownerId);
  const entries = Object.entries(counts.byAccount).filter(
    ([accountId, count]) => count > 0 && activeAccountIds.has(accountId),
  );
  return {
    all: entries.reduce((total, [, count]) => total + count, 0),
    byAccount: Object.fromEntries(entries),
  };
}

/** The counted threads' ids, or null until the counters are ready. */
export async function readInboxUnreadThreadIds(
  ctx: ReadCtx,
  ownerId: string,
  accountId?: Id<"mailAccounts">,
) {
  const counts = await getCountsDocument(ctx, ownerId);
  if (counts?.readyAt === undefined) return null;
  const [activeAccountIds, entries] = await Promise.all([
    getActiveAccountIds(ctx, ownerId),
    ctx.db
      .query("inboxUnreadThreads")
      .withIndex("by_owner_account", (q) =>
        accountId
          ? q.eq("ownerId", ownerId).eq("accountId", accountId)
          : q.eq("ownerId", ownerId),
      )
      .collect(),
  ]);
  return entries
    .filter((entry) => activeAccountIds.has(entry.accountId))
    .map((entry) => entry.threadId);
}

function unreadInputs(thread: Doc<"threads"> | null) {
  if (!thread || thread.inInbox === false || thread.unreadCount <= 0) {
    return null;
  }
  return `${String(thread.inInbox)}:${thread.latestInboxMessageId ?? ""}`;
}

export function registerInboxUnreadTriggers(triggers: Triggers<DataModel>) {
  triggers.register("threads", async (ctx, change) => {
    if (unreadInputs(change.oldDoc) === unreadInputs(change.newDoc)) return;
    await refreshInboxUnreadThread(ctx, change.id);
  });
  triggers.register("messageClassifications", async (ctx, change) => {
    if ((change.oldDoc?.isSpam === true) === (change.newDoc?.isSpam === true)) {
      return;
    }
    const messageId = (change.newDoc ?? change.oldDoc).messageId;
    const message = await ctx.db.get(messageId);
    if (message) await refreshInboxUnreadThread(ctx, message.threadId);
  });
}
