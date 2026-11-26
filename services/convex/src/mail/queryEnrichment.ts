import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { AuthedQueryCtx } from "../utils";
import {
  createListReads,
  isActiveAccount,
  toAllMailThreadListItem,
  toMessageListItem,
  toThreadListItem,
} from "./helpers";
import {
  countsAsUnreadInboxThread,
  readInboxUnreadCounts,
} from "./inboxUnread";
import { toListRow } from "./listRows";
import { isAllMailLocation } from "./location";
import { getUnreadCountSummary } from "./unreadCounts";

export type MailSearchScope = "all" | "inbox";

export async function getVisibleUnreadCountSummary(ctx: AuthedQueryCtx) {
  return (
    (await readInboxUnreadCounts(ctx, ctx.ownerId)) ??
    getUnreadCountSummary(await getVisibleUnreadInboxThreads(ctx, ctx.ownerId))
  );
}

/** The unread threads the inbox shows: active accounts, spam left out. */
export async function getVisibleUnreadInboxThreads(
  ctx: Pick<QueryCtx, "db">,
  ownerId: string,
  accountId?: Id<"mailAccounts">,
) {
  const threads = await ctx.db
    .query("threads")
    .withIndex("by_owner_unread", (q) =>
      q.eq("ownerId", ownerId).gt("unreadCount", 0),
    )
    .filter((q) => q.neq(q.field("inInbox"), false))
    .collect();
  const activeAccountIds = new Set(
    (
      await ctx.db
        .query("mailAccounts")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    )
      .filter(isActiveAccount)
      .map((account) => account._id),
  );
  const visibleThreads = await Promise.all(
    threads
      .filter(
        (thread) =>
          activeAccountIds.has(thread.accountId) &&
          (accountId === undefined || thread.accountId === accountId),
      )
      .map(async (thread) =>
        (await countsAsUnreadInboxThread(ctx, thread)) ? thread : null,
      ),
  );
  return visibleThreads.filter((thread) => thread !== null);
}

export async function enrichMessagePage<T extends { page: Doc<"messages">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
  scope: MailSearchScope = "inbox",
) {
  const { page: messages, ...pagination } = results;
  const reads = createListReads(ctx);
  const page = await Promise.all(
    messages.map(async (message) => {
      return await toMessageListItem(ctx, message, reads);
    }),
  );
  return {
    ...pagination,
    page: page
      .filter(
        (message): message is NonNullable<typeof message> =>
          message !== null &&
          message.classification?.isSpam !== true &&
          (scope === "inbox" || isAllMailLocation(message, message.location)),
      )
      .map(toListRow),
  };
}

export async function enrichAllMailPage<T extends { page: Doc<"threads">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
) {
  const { page, ...pagination } = results;
  const reads = createListReads(ctx);
  const items = await Promise.all(
    page.map(
      async (thread) => await toAllMailThreadListItem(ctx, thread, reads),
    ),
  );
  return {
    ...pagination,
    page: items
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null && item.classification?.isSpam !== true,
      )
      .map(toListRow),
  };
}

export async function enrichThreadPage<T extends { page: Doc<"threads">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
  pinnedOnly = false,
) {
  const { page, ...pagination } = results;
  const reads = createListReads(ctx);
  const items = await Promise.all(
    page.map(async (thread) => await toThreadListItem(ctx, thread, reads)),
  );
  return {
    ...pagination,
    page: items
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null &&
          item.classification?.isSpam !== true &&
          (!pinnedOnly || item.isPinned),
      )
      .map(toListRow),
  };
}
