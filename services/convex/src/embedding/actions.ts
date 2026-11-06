import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { createEmbedding } from "../ai/models";
import { embeddingText, normalizeMail } from "../classification/normalize";

export const runEmbedding = internalAction({
  args: { messageId: v.id("messages"), jobKey: v.string() },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(
      internal.embedding.internal.getJobInput,
      args,
    );
    if (!input) return null;
    const attempt = await ctx.runMutation(
      internal.embedding.internal.beginAttempt,
      args,
    );
    if (!attempt.ready) return null;

    try {
      const text = embeddingText(normalizeMail(input.message, input.content));
      const vector = await createEmbedding({
        ctx,
        ownerId: input.message.ownerId,
        input: text,
        jobKey: `${args.jobKey}:${attempt.attempt}:${Date.now()}`,
      });
      await ctx.runMutation(internal.embedding.internal.complete, {
        ...args,
        vector,
      });
    } catch (error) {
      await fail(ctx, args, errorMessage(error), false);
    }
    return null;
  },
});

async function fail(
  ctx: ActionCtx,
  args: { messageId: Id<"messages">; jobKey: string },
  error: string,
  forceTerminal: boolean,
) {
  await ctx.runMutation(internal.embedding.internal.recordFailure, {
    ...args,
    error,
    forceTerminal,
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown embedding error";
}
