import type { Infer } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { AuthedMutationCtx } from "../utils";
import type { vMailboxAddress } from "./validators";
import { internal } from "../_generated/api";
import { ensureOwnedAccount, ensureOwnedMessage } from "./helpers";
import {
  getIdempotentEnqueueResult,
  getReadyDraftAttachments,
  validateProviderAttachments,
  validateRecipientFields,
  validateSendRequest,
} from "./outbox";
import { resolveReplyMetadata } from "./replies";

type MailboxAddress = Infer<typeof vMailboxAddress>;

export interface EnqueuePlainTextArgs {
  accountId: Id<"mailAccounts">;
  attachmentIds?: Id<"draftAttachments">[];
  bcc?: MailboxAddress[];
  cc?: MailboxAddress[];
  idempotencyKey: string;
  plainText: string;
  replyToMessageId?: Id<"messages">;
  subject: string;
  to: MailboxAddress[];
}

/** Queues a plain-text message on the owner's account and schedules delivery. */
export async function enqueueOwnedPlainText(
  ctx: AuthedMutationCtx,
  args: EnqueuePlainTextArgs,
) {
  const account = await ensureOwnedAccount(ctx, ctx.ownerId, args.accountId);
  const recipients = validateRecipientFields(args);
  const idempotencyKey = validateSendRequest(account, args);
  const existing = await ctx.db
    .query("outboxMessages")
    .withIndex("by_account_idempotency", (q) =>
      q.eq("accountId", args.accountId).eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (existing) {
    return getIdempotentEnqueueResult(existing, {
      attachmentIds: args.attachmentIds,
      bcc: recipients.bcc,
      cc: recipients.cc,
      plainText: args.plainText,
      replyToMessageId: args.replyToMessageId,
      subject: args.subject,
      to: recipients.to,
    });
  }

  const replyMessage = args.replyToMessageId
    ? await ensureOwnedMessage(ctx, ctx.ownerId, args.replyToMessageId)
    : undefined;
  const replyMetadata = replyMessage
    ? resolveReplyMetadata(replyMessage, ctx.ownerId, account._id)
    : {};
  const { attachmentIds, attachments } = await getReadyDraftAttachments(
    ctx,
    args.attachmentIds ?? [],
  );
  validateProviderAttachments(account, attachments);

  const now = Date.now();
  const outboxId = await ctx.db.insert("outboxMessages", {
    ownerId: ctx.ownerId,
    accountId: args.accountId,
    idempotencyKey,
    to: recipients.to,
    cc: recipients.cc,
    bcc: recipients.bcc,
    subject: args.subject,
    plainText: args.plainText,
    ...replyMetadata,
    attachmentIds,
    status: "pending",
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    attachments.map(async (attachment) => {
      await ctx.db.patch(attachment._id, {
        status: "claimed",
        outboxId,
        updatedAt: now,
      });
    }),
  );
  await ctx.scheduler.runAfter(
    0,
    internal.sync.internal.deliverProviderOutbox,
    { outboxId },
  );
  return { outboxId, reused: false, status: "pending" } as const;
}
