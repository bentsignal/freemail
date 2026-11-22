import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { authedQuery } from "../utils";
import {
  createListReads,
  ensureListableAccount,
  toArchivedThreadListItem,
} from "./helpers";
import { toListRow } from "./listRows";

export const listArchive = authedQuery({
  args: {
    accountId: v.optional(v.id("mailAccounts")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const accountId = args.accountId;
    if (accountId) {
      await ensureListableAccount(ctx, ctx.ownerId, accountId);
    }
    const result = accountId
      ? await ctx.db
          .query("threads")
          .withIndex("by_account_archived", (q) =>
            q.eq("accountId", accountId).gt("archivedAt", 0),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("threads")
          .withIndex("by_owner_archived", (q) =>
            q.eq("ownerId", ctx.ownerId).gt("archivedAt", 0),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    const { page, ...pagination } = result;
    const reads = createListReads(ctx);
    const items = await Promise.all(
      page.map(
        async (thread) => await toArchivedThreadListItem(ctx, thread, reads),
      ),
    );
    return {
      ...pagination,
      page: items
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .map((item) => ({ ...toListRow(item), archivedAt: item.archivedAt })),
    };
  },
});

export const searchArchive = authedQuery({
  args: {
    accountId: v.optional(v.id("mailAccounts")),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const accountId = args.accountId;
    if (accountId) {
      await ensureListableAccount(ctx, ctx.ownerId, accountId);
    }
    const threads = accountId
      ? await ctx.db
          .query("threads")
          .withIndex("by_account_archived", (q) =>
            q.eq("accountId", accountId).gt("archivedAt", 0),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("threads")
          .withIndex("by_owner_archived", (q) =>
            q.eq("ownerId", ctx.ownerId).gt("archivedAt", 0),
          )
          .order("desc")
          .collect();
    const reads = createListReads(ctx);
    const items = await Promise.all(
      threads.map(
        async (thread) => await toArchivedThreadListItem(ctx, thread, reads),
      ),
    );
    const query = args.searchTerm.trim().toLocaleLowerCase();
    return items
      .filter((item): item is NonNullable<typeof item> => {
        if (!item) return false;
        return [item.from.name, item.from.address, item.subject, item.snippet]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLocaleLowerCase().includes(query));
      })
      .map((item) => ({ ...toListRow(item), archivedAt: item.archivedAt }));
  },
});
