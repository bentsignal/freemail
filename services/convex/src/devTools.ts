import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { createAuth } from "./auth";
import { env } from "./convex.env";
import { bulkMailbox } from "./devSeedBulk";
import {
  ISOLATED_ACCOUNTS,
  ISOLATED_OWNER_NAME,
  isolatedMailbox,
} from "./devSeedMailbox";
import { seedSentMail } from "./devSeedSent";
import { projectDemoInboxMessages } from "./devSeedThreads";
import {
  deleteDemoAccountRecords,
  ensureDemoAccount,
  ensureDemoMessage,
} from "./devSeedWrites";
import { requireDevTools } from "./devSignIn";
import { DEV_USER_EMAIL } from "./devToolsPolicy";
import { internalMutation } from "./functions";

/**
 * Isolated backends only (`scripts/backend.sh isolate`): the test owner the
 * simulator signs in as. Written through the raw adapter because
 * `privateAccountHooks` closes registration; the script then makes the
 * returned id `AUTH_ALLOWED_USER_ID`.
 */
export const ensureOwner = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireDevTools();
    const { adapter } = await createAuth(ctx).$context;
    const existing = await adapter.findOne<{ id: string }>({
      model: "user",
      where: [{ field: "email", value: DEV_USER_EMAIL }],
    });
    if (existing) return existing.id;
    const now = new Date();
    const user = await adapter.create<Record<string, unknown>, { id: string }>({
      model: "user",
      data: {
        createdAt: now,
        email: DEV_USER_EMAIL,
        emailVerified: true,
        name: ISOLATED_OWNER_NAME,
        updatedAt: now,
      },
    });
    return user.id;
  },
});

/**
 * Replaces the test owner's seeded mailbox with a fresh one dated now, plus
 * `bulkThreads` older filler threads for paging through a long inbox.
 */
export const seed = internalMutation({
  args: { bulkThreads: v.optional(v.number()) },
  handler: async (ctx, args) => {
    requireDevTools();
    const ownerId = env.AUTH_ALLOWED_USER_ID;
    const existing = await ctx.db
      .query("mailAccounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const account of existing) {
      if (account.isDemo === true) {
        await deleteDemoAccountRecords(ctx, account._id);
      }
    }

    const accountIds = new Map<string, Id<"mailAccounts">>();
    for (const account of ISOLATED_ACCOUNTS) {
      accountIds.set(
        account.key,
        await ensureDemoAccount(ctx, ownerId, account),
      );
    }
    let messages = 0;
    const now = Date.now();
    for (const fixture of [
      ...isolatedMailbox(now),
      ...bulkMailbox(now, args.bulkThreads ?? 0),
    ]) {
      const accountId = accountIds.get(fixture.account);
      if (!accountId) throw new ConvexError("Seed account not found");
      messages += await ensureDemoMessage(ctx, ownerId, accountId, fixture);
    }
    await projectDemoInboxMessages(ctx, accountIds.values());
    await seedSentMail(ctx, ownerId, accountIds, Date.now());
    await ctx.scheduler.runAfter(
      0,
      internal.mail.inboxUnreadBackfill.backfill,
      { ownerId },
    );
    return { accounts: accountIds.size, messages };
  },
});

/**
 * Gives every seeded attachment a placeholder file in storage, so tapping one
 * downloads and opens the share sheet as real mail does. Run after `seed`.
 */
export const storeSeedAttachmentFiles = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    requireDevTools();
    const ownerId = env.AUTH_ALLOWED_USER_ID;
    const attachments = await ctx.runQuery(
      internal.devTools.seedAttachmentsWithoutFiles,
      { ownerId },
    );
    for (const attachment of attachments) {
      const storageId = await ctx.storage.store(
        new Blob([`Placeholder for ${attachment.fileName}\n`]),
      );
      await ctx.runMutation(
        internal.attachments.internal.commitDownloadedFile,
        { ownerId, attachmentId: attachment._id, storageId },
      );
    }
    return attachments.length;
  },
});

export const seedAttachmentsWithoutFiles = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    requireDevTools();
    const accounts = await ctx.db
      .query("mailAccounts")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    const messages = await Promise.all(
      accounts
        .filter((account) => account.isDemo === true)
        .map((account) =>
          ctx.db
            .query("messages")
            .withIndex("by_account_received", (q) =>
              q.eq("accountId", account._id),
            )
            .collect(),
        ),
    );
    const attachments = await Promise.all(
      messages.flat().map((message) =>
        ctx.db
          .query("attachments")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect(),
      ),
    );
    return attachments.flat().filter((attachment) => !attachment.storageId);
  },
});
