import type { ComposerDraft } from "@freemail/features/mail";

import type { NativeComposerAttachment } from "../screens/use-native-attachments";

/** Bumped when the saved shape changes, so an older file is ignored. */
export const REPLY_DRAFTS_VERSION = 1;

/**
 * The server deletes an unsent attachment a day after its upload
 * (attachments/internal.ts), so a draft drops one a little before that.
 */
export const ATTACHMENT_KEEP_MS = 20 * 60 * 60 * 1000;

type Draft = ComposerDraft<NativeComposerAttachment>;

export interface SavedAttachment {
  attachment: NativeComposerAttachment;
  savedAt: number;
}

export interface ReplyDraft {
  accountId?: string;
  attachments: SavedAttachment[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  to: string;
  updatedAt: number;
}

export type ReplyDrafts = Record<string, ReplyDraft>;

interface ReplyDraftsFile {
  drafts: ReplyDrafts;
  version: typeof REPLY_DRAFTS_VERSION;
}

/** A reply with nothing written in it isn't worth keeping. */
export function isWorthKeeping(draft: Draft) {
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
export function toReplyDraft({
  accountId,
  draft,
  now,
  previous,
}: {
  accountId: string | undefined;
  draft: Draft;
  now: number;
  previous: ReplyDraft | undefined;
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
  } satisfies ReplyDraft;
}

export function toComposerDraft(saved: ReplyDraft, now: number) {
  return {
    attachments: saved.attachments
      .filter((item) => now - item.savedAt < ATTACHMENT_KEEP_MS)
      .map((item) => item.attachment),
    bcc: saved.bcc,
    body: saved.body,
    cc: saved.cc,
    subject: saved.subject,
    to: saved.to,
  } satisfies Draft;
}

export function serializeReplyDrafts(drafts: ReplyDrafts) {
  return JSON.stringify({
    drafts,
    version: REPLY_DRAFTS_VERSION,
  } satisfies ReplyDraftsFile);
}

export function parseReplyDrafts(text: string) {
  return toReplyDrafts(JSON.parse(text));
}

function toReplyDrafts(saved: unknown) {
  if (
    typeof saved !== "object" ||
    saved === null ||
    !("version" in saved) ||
    saved.version !== REPLY_DRAFTS_VERSION ||
    !("drafts" in saved) ||
    typeof saved.drafts !== "object" ||
    saved.drafts === null
  ) {
    return {} satisfies ReplyDrafts;
  }
  return Object.fromEntries(
    Object.entries(saved.drafts).filter(
      (entry): entry is [string, ReplyDraft] => isReplyDraft(entry[1]),
    ),
  );
}

const TEXT_FIELDS = ["bcc", "body", "cc", "subject", "to"] as const;

function isReplyDraft(draft: unknown): draft is ReplyDraft {
  if (typeof draft !== "object" || draft === null) return false;
  const fields = new Map(Object.entries(draft));
  return (
    TEXT_FIELDS.every((field) => typeof fields.get(field) === "string") &&
    typeof fields.get("updatedAt") === "number" &&
    Array.isArray(fields.get("attachments"))
  );
}
