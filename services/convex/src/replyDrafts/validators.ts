import { v } from "convex/values";

/**
 * A reply being written, saved for its thread so every device can pick it
 * up. One per thread; the newest edit wins.
 */
export const vReplyDraft = v.object({
  ownerId: v.string(),
  threadId: v.id("threads"),
  accountId: v.optional(v.id("mailAccounts")),
  to: v.string(),
  cc: v.string(),
  bcc: v.string(),
  subject: v.string(),
  body: v.string(),
  attachmentIds: v.array(v.id("draftAttachments")),
  /** When it was last edited, by the editing device's clock. */
  updatedAt: v.number(),
});
