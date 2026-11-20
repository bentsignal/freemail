import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { AuthedQueryCtx } from "../utils";
import {
  isActiveAccount,
  toAllMailThreadListItem,
  toMessageListItem,
  toThreadListItem,
} from "./helpers";
import { isAllMailLocation } from "./location";
import { getUnreadCountSummary } from "./unreadCounts";

export type MailSearchScope = "all" | "inbox";

export async function getVisibleUnreadCountSummary(ctx: AuthedQueryCtx) {
  return getUnreadCountSummary(
    await getVisibleUnreadInboxThreads(ctx, ctx.ownerId),
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
      .map(async (thread) => ({
        item: await toThreadListItem(ctx, thread),
        thread,
      })),
  );
  return visibleThreads
    .filter(({ item }) => item?.classification?.isSpam !== true)
    .map(({ thread }) => thread);
}

export async function enrichMessagePage<T extends { page: Doc<"messages">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
  scope: MailSearchScope = "inbox",
) {
  const page = await Promise.all(
    results.page.map(async (message) => {
      return await toMessageListItem(ctx, message);
    }),
  );
  return {
    ...results,
    page: page.filter(
      (message): message is NonNullable<typeof message> =>
        message !== null &&
        message.classification?.isSpam !== true &&
        (scope === "inbox" || isAllMailLocation(message, message.location)),
    ),
  };
}

export async function enrichAllMailPage<T extends { page: Doc<"threads">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
) {
  const { page, ...pagination } = results;
  const items = await Promise.all(
    page.map(async (thread) => await toAllMailThreadListItem(ctx, thread)),
  );
  return {
    ...pagination,
    page: items.filter(
      (item): item is NonNullable<typeof item> =>
        item !== null && item.classification?.isSpam !== true,
    ),
  };
}

export async function enrichThreadPage<T extends { page: Doc<"threads">[] }>(
  ctx: AuthedQueryCtx,
  results: T,
  pinnedOnly = false,
) {
  const { page, ...pagination } = results;
  const items = await Promise.all(
    page.map(async (thread) => await toThreadListItem(ctx, thread)),
  );
  return {
    ...pagination,
    page: items.filter(
      (item): item is NonNullable<typeof item> =>
        item !== null &&
        item.classification?.isSpam !== true &&
        (!pinnedOnly || item.isPinned),
    ),
  };
}
