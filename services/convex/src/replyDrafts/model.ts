import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getDraft(
  ctx: Pick<QueryCtx, "db">,
  ownerId: string,
  threadId: Id<"threads">,
) {
  return await ctx.db
    .query("replyDrafts")
    .withIndex("by_owner_thread", (q) =>
      q.eq("ownerId", ownerId).eq("threadId", threadId),
    )
    .unique();
}

/** A sent reply's draft is done, on every device. */
export async function deleteDraft(
  ctx: Pick<MutationCtx, "db">,
  ownerId: string,
  threadId: Id<"threads">,
) {
  const draft = await getDraft(ctx, ownerId, threadId);
  if (draft) await ctx.db.delete(draft._id);
}

/** The unsent attachments a reply draft still holds, kept past expiry. */
export async function getHeldAttachmentIds(
  ctx: Pick<QueryCtx, "db">,
  ownerId: string,
) {
  const drafts = await ctx.db
    .query("replyDrafts")
    .withIndex("by_owner_thread", (q) => q.eq("ownerId", ownerId))
    .collect();
  return new Set(drafts.flatMap((draft) => draft.attachmentIds));
}
