import { authedQuery } from "../utils";

/**
 * Every reply being written, newest first, with its uploaded attachments.
 * A draft whose thread is gone, or an attachment that's gone, is left out.
 */
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const drafts = await ctx.db
      .query("replyDrafts")
      .withIndex("by_owner_thread", (q) => q.eq("ownerId", ctx.ownerId))
      .collect();
    const rows = await Promise.all(
      drafts.map(async (draft) => {
        const thread = await ctx.db.get(draft.threadId);
        if (!thread || thread.ownerId !== ctx.ownerId) return [];
        const attachments = await Promise.all(
          draft.attachmentIds.map((id) => ctx.db.get(id)),
        );
        return [
          {
            accountId: draft.accountId,
            attachments: attachments.flatMap((attachment) =>
              attachment?.ownerId === ctx.ownerId &&
              attachment.status === "ready" &&
              attachment.size !== undefined
                ? [
                    {
                      _id: attachment._id,
                      contentType: attachment.contentType,
                      fileName: attachment.fileName,
                      size: attachment.size,
                    },
                  ]
                : [],
            ),
            bcc: draft.bcc,
            body: draft.body,
            cc: draft.cc,
            subject: draft.subject,
            threadId: draft.threadId,
            to: draft.to,
            updatedAt: draft.updatedAt,
          },
        ];
      }),
    );
    return rows.flat().sort((a, b) => b.updatedAt - a.updatedAt);
  },
});
