import type { ComposerAttachment, ComposerDraft } from "./types";

/** Bumped when the saved shape changes, so an older copy is ignored. */
export const REPLY_DRAFTS_VERSION = 2;

/**
 * A reply being written, as this device has it. `updatedAt` is when it was
 * last edited (on whichever device); `syncedAt` is the edit the server is
 * known to have, so a draft whose two differ still has to be sent.
 */
export interface ReplyDraft {
  accountId?: string;
  attachments: ComposerAttachment[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  syncedAt?: number;
  to: string;
  updatedAt: number;
}

export interface ReplyDraftState {
  /** Drafts deleted here that the server may still have, by deletion time. */
  deleted: Record<string, number>;
  drafts: Record<string, ReplyDraft>;
}

/** A draft as the server lists it (replyDrafts/queries.ts). */
export interface ServerReplyDraft {
  accountId?: string;
  attachments: {
    _id: string;
    contentType: string;
    fileName: string;
    size: number;
  }[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  threadId: string;
  to: string;
  updatedAt: number;
}

export function createEmptyReplyDraftState() {
  return { deleted: {}, drafts: {} } satisfies ReplyDraftState;
}

/** A reply with nothing written in it isn't worth keeping. */
export function isReplyDraftWorthKeeping(draft: ComposerDraft) {
  return (
    draft.body.trim().length > 0 ||
    draft.cc.trim().length > 0 ||
    draft.bcc.trim().length > 0 ||
    draft.attachments.some((attachment) => attachment.status === "ready")
  );
}

export function isReplyDraftUnsynced(draft: ReplyDraft) {
  return draft.syncedAt !== draft.updatedAt;
}

/**
 * Only uploaded attachments are kept: an upload still running when the
 * composer closes has nowhere to report back to. Each edit is newer than
 * the last, even when that one came from a device whose clock is ahead.
 */
export function toReplyDraft({
  accountId,
  draft,
  now,
  previous,
}: {
  accountId: string | undefined;
  draft: ComposerDraft;
  now: number;
  previous: ReplyDraft | undefined;
}) {
  return {
    accountId,
    attachments: draft.attachments.filter(
      (attachment) => attachment.status === "ready",
    ),
    bcc: draft.bcc,
    body: draft.body,
    cc: draft.cc,
    subject: draft.subject,
    syncedAt: previous?.syncedAt,
    to: draft.to,
    updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1),
  } satisfies ReplyDraft;
}

export function toComposerDraft(saved: ReplyDraft) {
  return {
    attachments: saved.attachments,
    bcc: saved.bcc,
    body: saved.body,
    cc: saved.cc,
    subject: saved.subject,
    to: saved.to,
  } satisfies ComposerDraft;
}

/**
 * Folds the server's drafts into this device's. The newer edit of each
 * wins. A draft the server no longer has was sent or deleted elsewhere, so
 * it goes here too, unless it has edits the server hasn't seen. Returns the
 * threads whose draft another device edited.
 */
export function mergeServerReplyDrafts(
  state: ReplyDraftState,
  server: ServerReplyDraft[],
) {
  const serverByThread = new Map(server.map((row) => [row.threadId, row]));
  const drafts = new Map<string, ReplyDraft>();
  const edited = new Set<string>();
  for (const [threadId, local] of Object.entries(state.drafts)) {
    if (!serverByThread.has(threadId) && isReplyDraftUnsynced(local)) {
      drafts.set(threadId, local);
    }
  }
  for (const row of server) {
    const merged = mergeServerRow(
      row,
      state.drafts[row.threadId],
      state.deleted[row.threadId],
    );
    if (!merged) continue;
    drafts.set(row.threadId, merged.draft);
    if (merged.edited) edited.add(row.threadId);
  }
  // Still to delete: only what the server has, unedited since.
  const deleted = Object.fromEntries(
    Object.entries(state.deleted).filter(
      ([threadId, deletedAt]) =>
        (serverByThread.get(threadId)?.updatedAt ?? Infinity) <= deletedAt,
    ),
  );
  return {
    edited: [...edited],
    state: {
      deleted,
      drafts: Object.fromEntries(drafts),
    } satisfies ReplyDraftState,
  };
}

function mergeServerRow(
  row: ServerReplyDraft,
  local: ReplyDraft | undefined,
  deletedAt: number | undefined,
) {
  if (deletedAt !== undefined && deletedAt >= row.updatedAt) return undefined;
  if (local && local.updatedAt > row.updatedAt) {
    return { draft: local, edited: false };
  }
  if (local?.updatedAt === row.updatedAt) {
    const draft =
      local.syncedAt === row.updatedAt
        ? local
        : { ...local, syncedAt: row.updatedAt };
    return { draft, edited: false };
  }
  return { draft: fromServer(row, local), edited: true };
}

function fromServer(row: ServerReplyDraft, local: ReplyDraft | undefined) {
  return {
    accountId: row.accountId,
    attachments: row.attachments.map(
      (attachment) =>
        local?.attachments.find(
          (item) => item.draftAttachmentId === attachment._id,
        ) ?? {
          contentType: attachment.contentType,
          draftAttachmentId: attachment._id,
          fileName: attachment.fileName,
          id: attachment._id,
          size: attachment.size,
          status: "ready" as const,
        },
    ),
    bcc: row.bcc,
    body: row.body,
    cc: row.cc,
    subject: row.subject,
    syncedAt: row.updatedAt,
    to: row.to,
    updatedAt: row.updatedAt,
  } satisfies ReplyDraft;
}

export function serializeReplyDraftState(state: ReplyDraftState) {
  return JSON.stringify({ ...state, version: REPLY_DRAFTS_VERSION });
}

/** The drafts saved by this app, or none when the copy is unreadable. */
export function parseReplyDraftState(text: string) {
  return toReplyDraftState(JSON.parse(text));
}

function toReplyDraftState(saved: unknown) {
  if (
    typeof saved !== "object" ||
    saved === null ||
    !("version" in saved) ||
    saved.version !== REPLY_DRAFTS_VERSION ||
    !("deleted" in saved) ||
    !("drafts" in saved)
  ) {
    return createEmptyReplyDraftState();
  }
  return {
    deleted: Object.fromEntries(
      entriesOf(saved.deleted).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    ),
    drafts: Object.fromEntries(
      entriesOf(saved.drafts).filter((entry): entry is [string, ReplyDraft] =>
        isReplyDraft(entry[1]),
      ),
    ),
  } satisfies ReplyDraftState;
}

function entriesOf(value: unknown) {
  return typeof value === "object" && value !== null
    ? Object.entries(value)
    : [];
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
