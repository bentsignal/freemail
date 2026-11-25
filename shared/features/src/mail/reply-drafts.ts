import type { ComposerAttachment, ComposerDraft } from "./types";

/** Bumped when the saved shape changes, so an older copy is ignored. */
export const REPLY_DRAFTS_VERSION = 1;

/**
 * The server deletes an unsent attachment a day after its upload
 * (attachments/internal.ts), so a draft drops one a little before that.
 */
export const ATTACHMENT_KEEP_MS = 20 * 60 * 60 * 1000;

export interface SavedAttachment<TAttachment extends ComposerAttachment> {
  attachment: TAttachment;
  savedAt: number;
}

export interface ReplyDraft<
  TAttachment extends ComposerAttachment = ComposerAttachment,
> {
  accountId?: string;
  attachments: SavedAttachment<TAttachment>[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  to: string;
  updatedAt: number;
}

export type ReplyDrafts<
  TAttachment extends ComposerAttachment = ComposerAttachment,
> = Record<string, ReplyDraft<TAttachment>>;

/** A reply with nothing written in it isn't worth keeping. */
export function isReplyDraftWorthKeeping(draft: ComposerDraft) {
  return (
    draft.body.trim().length > 0 ||
    draft.cc.trim().length > 0 ||
    draft.bcc.trim().length > 0 ||
    draft.attachments.some((attachment) => attachment.status === "ready")
  );
}

/**
 * Only uploaded attachments are kept: an upload still running when the
 * composer closes has nowhere to report back to.
 */
export function toReplyDraft<TAttachment extends ComposerAttachment>({
  accountId,
  draft,
  now,
  previous,
}: {
  accountId: string | undefined;
  draft: ComposerDraft<TAttachment>;
  now: number;
  previous: ReplyDraft<TAttachment> | undefined;
}) {
  return {
    accountId,
    attachments: draft.attachments
      .filter((attachment) => attachment.status === "ready")
      .map((attachment) => ({
        attachment,
        savedAt:
          previous?.attachments.find(
            (saved) => saved.attachment.id === attachment.id,
          )?.savedAt ?? now,
      })),
    bcc: draft.bcc,
    body: draft.body,
    cc: draft.cc,
    subject: draft.subject,
    to: draft.to,
    updatedAt: now,
  } satisfies ReplyDraft<TAttachment>;
}

export function toComposerDraft<TAttachment extends ComposerAttachment>(
  saved: ReplyDraft<TAttachment>,
  now: number,
) {
  return {
    attachments: saved.attachments
      .filter((item) => now - item.savedAt < ATTACHMENT_KEEP_MS)
      .map((item) => item.attachment),
    bcc: saved.bcc,
    body: saved.body,
    cc: saved.cc,
    subject: saved.subject,
    to: saved.to,
  } satisfies ComposerDraft<TAttachment>;
}

export function serializeReplyDrafts<TAttachment extends ComposerAttachment>(
  drafts: ReplyDrafts<TAttachment>,
) {
  return JSON.stringify({ drafts, version: REPLY_DRAFTS_VERSION });
}

/** The drafts saved by this app, or none when the copy is unreadable. */
export function parseReplyDrafts<TAttachment extends ComposerAttachment>(
  text: string,
) {
  return Object.fromEntries(
    Object.entries(getCurrentDrafts(JSON.parse(text)) ?? {}).filter(
      (entry): entry is [string, ReplyDraft<TAttachment>] =>
        isReplyDraft(entry[1]),
    ),
  );
}

function getCurrentDrafts(saved: unknown) {
  if (
    typeof saved !== "object" ||
    saved === null ||
    !("version" in saved) ||
    saved.version !== REPLY_DRAFTS_VERSION ||
    !("drafts" in saved) ||
    typeof saved.drafts !== "object" ||
    saved.drafts === null
  ) {
    return undefined;
  }
  return saved.drafts;
}

const TEXT_FIELDS = ["bcc", "body", "cc", "subject", "to"] as const;

function isReplyDraft(draft: unknown) {
  if (typeof draft !== "object" || draft === null) return false;
  const fields = new Map(Object.entries(draft));
  return (
    TEXT_FIELDS.every((field) => typeof fields.get(field) === "string") &&
    typeof fields.get("updatedAt") === "number" &&
    Array.isArray(fields.get("attachments"))
  );
}

/** Copies the drafts without one thread's. */
export function withoutReplyDraft<TAttachment extends ComposerAttachment>(
  drafts: ReplyDrafts<TAttachment>,
  threadId: string,
) {
  return Object.fromEntries(
    Object.entries(drafts).filter(([key]) => key !== threadId),
  );
}
