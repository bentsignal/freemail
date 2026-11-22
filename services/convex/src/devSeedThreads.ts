import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { DemoMessage } from "./devSeedFixtures";

export function isDemoInboxMessage(fixture: Pick<DemoMessage, "placement">) {
  return fixture.placement !== "archive" && fixture.placement !== "folder";
}

export async function ensureDemoThread({
  ctx,
  ownerId,
  accountId,
  fixture,
  now,
}: {
  ctx: MutationCtx;
  ownerId: string;
  accountId: Id<"mailAccounts">;
  fixture: DemoMessage;
  now: number;
}) {
  const archivedAt =
    fixture.placement === "archive" ? fixture.receivedAt : undefined;
  const inInbox = isDemoInboxMessage(fixture);
  const unread = fixture.isRead ? 0 : 1;
  const existing = await ctx.db
    .query("threads")
    .withIndex("by_account_remote", (q) =>
      q.eq("accountId", accountId).eq("remoteThreadId", fixture.remoteThreadId),
    )
    .first();
  if (existing) {
    const isLatest = fixture.receivedAt > existing.latestMessageAt;
    await ctx.db.patch(existing._id, {
      messageCount: existing.messageCount + 1,
      unreadCount: existing.unreadCount + unread,
      isPinned: existing.isPinned === true || fixture.isPinned,
      hasAttachments:
        existing.hasAttachments || fixture.attachment !== undefined,
      ...(isLatest
        ? {
            subject: fixture.subject,
            snippet: fixture.snippet,
            latestMessageAt: fixture.receivedAt,
            ...(inInbox ? { latestInboxMessageAt: fixture.receivedAt } : {}),
          }
        : {}),
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("threads", {
    ownerId,
    accountId,
    remoteThreadId: fixture.remoteThreadId,
    subject: fixture.subject,
    snippet: fixture.snippet,
    participants: [fixture.from],
    latestMessageAt: fixture.receivedAt,
    ...(inInbox ? { latestInboxMessageAt: fixture.receivedAt } : {}),
    messageCount: 1,
    unreadCount: unread,
    inInbox,
    isPinned: fixture.isPinned,
    ...(archivedAt === undefined ? {} : { archivedAt }),
    hasAttachments: fixture.attachment !== undefined,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Each seeded inbox thread names its newest inbox message, as provider sync
 * does (`latestInboxMessageId`), so the lists read it the way production's
 * do.
 */
export async function projectDemoInboxMessages(
  ctx: MutationCtx,
  accountIds: Iterable<Id<"mailAccounts">>,
) {
  for (const accountId of accountIds) {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_account_latest", (q) => q.eq("accountId", accountId))
      .collect();
    for (const thread of threads) {
      if (!thread.inInbox) continue;
      const latest = await ctx.db
        .query("messages")
        .withIndex("by_thread_received", (q) => q.eq("threadId", thread._id))
        .order("desc")
        .filter((q) => q.eq(q.field("inInbox"), true))
        .first();
      if (latest && latest._id !== thread.latestInboxMessageId) {
        await ctx.db.patch(thread._id, { latestInboxMessageId: latest._id });
      }
    }
  }
}
