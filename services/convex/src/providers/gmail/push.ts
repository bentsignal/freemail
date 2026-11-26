import { v } from "convex/values";

import { internal } from "../../_generated/api";
import {
  httpAction,
  internalAction,
  internalQuery,
} from "../../_generated/server";
import { providerEnv } from "../env";
import { GmailAdapter } from "./api";
import { parsePushNotification, pushTokenMatches } from "./pushPayload";
import { getUsableGmailTokens } from "./tokenAccess";

export const pushWebhook = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token");
  if (!pushTokenMatches(providerEnv.GMAIL_PUSH_TOKEN?.trim(), token)) {
    return new Response(null, { status: 403 });
  }
  const notification = parsePushNotification(
    await request.json().catch(() => null),
  );
  if (!notification) {
    console.error("Gmail push: unreadable Pub/Sub message");
    return new Response(null, { status: 204 });
  }
  const accounts = await ctx.runQuery(
    internal.providers.gmail.push.listPushAccounts,
    { address: notification.emailAddress },
  );
  if (accounts.length === 0) {
    console.warn(
      `Gmail push: no connected account for ${notification.emailAddress}`,
    );
  }
  for (const account of accounts) {
    await ctx.scheduler.runAfter(0, internal.sync.internal.executeGmailSync, {
      ...account,
      reason: "incremental",
    });
  }
  return new Response(null, { status: 204 });
});

export const listPushAccounts = internalQuery({
  args: { address: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const accounts = await ctx.db.query("mailAccounts").collect();
    return accounts
      .filter(
        (account) =>
          account.provider === "gmail" &&
          !account.isDemo &&
          account.deletingAt === undefined &&
          ["connected", "error", "syncing"].includes(account.status) &&
          (args.address === undefined ||
            account.remoteAccountId.toLowerCase() === args.address ||
            account.address.toLowerCase() === args.address),
      )
      .map((account) => ({
        ownerId: account.ownerId,
        accountId: account._id,
      }));
  },
});

export const renewWatches = internalAction({
  args: {},
  handler: async (ctx) => {
    const topicName = providerEnv.GMAIL_PUBSUB_TOPIC?.trim();
    if (!topicName) return { renewed: 0, failed: 0, configured: false };
    const accounts = await ctx.runQuery(
      internal.providers.gmail.push.listPushAccounts,
      {},
    );
    const adapter = new GmailAdapter();
    let renewed = 0;
    let failed = 0;
    for (const account of accounts) {
      try {
        const connection = await ctx.runQuery(
          internal.sync.internal.getGmailSyncContext,
          account,
        );
        if (!connection) throw new Error("Gmail connection is unavailable");
        const tokens = await getUsableGmailTokens(ctx, {
          ...account,
          encryptedTokens: connection.credential.encryptedTokens,
        });
        const { expiration } = await adapter.watch(
          tokens.accessToken,
          topicName,
        );
        renewed += 1;
        console.log(
          `Gmail push: watching ${account.accountId} until ${new Date(expiration).toISOString()}`,
        );
      } catch (error) {
        failed += 1;
        console.error(
          `Gmail push: watch renewal failed for ${account.accountId}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return { renewed, failed, configured: true };
  },
});
