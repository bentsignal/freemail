import type {
  ReplyDraft,
  ReplyDraftState,
  ServerReplyDraft,
} from "./reply-drafts";
import type { ComposerDraft } from "./types";
import {
  createEmptyReplyDraftState,
  isReplyDraftUnsynced,
  isReplyDraftWorthKeeping,
  mergeServerReplyDrafts,
  parseReplyDraftState,
  serializeReplyDraftState,
  toReplyDraft,
} from "./reply-drafts";

/** Where a device keeps its copy of the drafts (a file, localStorage). */
export interface ReplyDraftStorage {
  read: () => string | null | undefined;
  write: (text: string) => void;
}

export interface SavedReplyDraft {
  accountId?: string;
  attachmentIds: string[];
  bcc: string;
  body: string;
  cc: string;
  subject: string;
  threadId: string;
  to: string;
  updatedAt: number;
}

/** The server's draft mutations (replyDrafts/mutations.ts). */
export interface ReplyDraftRemote {
  remove: (args: { deletedAt: number; threadId: string }) => Promise<unknown>;
  save: (draft: SavedReplyDraft) => Promise<{ updatedAt: number }>;
}

const PUSH_DELAY_MS = 1000;
const RETRY_DELAY_MS = 5000;

/**
 * Reply drafts on this device, synced with the server. Every edit is kept
 * here at once, so a composer opens instantly and offline; edits reach the
 * server a second after typing pauses, and the server's drafts (other
 * devices' edits) come in through `applyServer`.
 */
export function createReplyDraftStore({
  now = Date.now,
  storage,
}: {
  now?: () => number;
  storage: ReplyDraftStorage;
}) {
  const local = createLocalCopy(storage);
  const pusher = createPusher(local);
  // Bumped when another device edits a thread's draft, so an open composer
  // can take the edit.
  const editVersions = new Map<string, number>();

  function remove(threadId: string) {
    const { deleted, drafts } = local.current();
    const previous = drafts[threadId];
    if (!previous) return;
    local.commit({
      deleted: { ...deleted, [threadId]: Math.max(now(), previous.updatedAt) },
      drafts: without(drafts, threadId),
    });
    pusher.schedule();
  }

  function save(
    threadId: string,
    draft: ComposerDraft,
    accountId: string | undefined,
  ) {
    if (!isReplyDraftWorthKeeping(draft)) {
      remove(threadId);
      return;
    }
    const { deleted, drafts } = local.current();
    const next = toReplyDraft({
      accountId,
      draft,
      now: now(),
      previous: drafts[threadId],
    });
    local.commit({
      deleted: without(deleted, threadId),
      drafts: { ...drafts, [threadId]: next },
    });
    pusher.schedule();
  }

  function applyServer(rows: ServerReplyDraft[]) {
    const merged = mergeServerReplyDrafts(local.current(), rows);
    for (const threadId of merged.edited) {
      editVersions.set(threadId, (editVersions.get(threadId) ?? 0) + 1);
    }
    local.commit(merged.state);
    if (hasUnsynced(merged.state)) pusher.schedule(0);
  }

  return {
    applyServer,
    connect: pusher.connect,
    /** Signing out forgets every draft on this device. */
    forget() {
      pusher.connect(undefined);
      editVersions.clear();
      local.commit(createEmptyReplyDraftState());
    },
    get: (threadId: string) => local.current().drafts[threadId],
    getEditVersion: (threadId: string) => editVersions.get(threadId) ?? 0,
    remove,
    save,
    subscribe: local.subscribe,
  };
}

function createLocalCopy(storage: ReplyDraftStorage) {
  let state: ReplyDraftState | undefined;
  const listeners = new Set<() => void>();

  function readState() {
    try {
      const text = storage.read();
      return text ? parseReplyDraftState(text) : createEmptyReplyDraftState();
    } catch {
      return createEmptyReplyDraftState();
    }
  }

  function commit(next: ReplyDraftState) {
    state = next;
    for (const listener of listeners) listener();
    try {
      storage.write(serializeReplyDraftState(next));
    } catch {
      // Storage is full or blocked: the drafts last until the app closes.
    }
  }

  function current() {
    state ??= readState();
    return state;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { commit, current, subscribe };
}

/** Sends deletions and unsynced edits, one pass at a time, retrying on failure. */
function createPusher(local: ReturnType<typeof createLocalCopy>) {
  let remote: ReplyDraftRemote | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pushing = false;
  let pushAgain = false;

  function schedule(delayMs = PUSH_DELAY_MS) {
    clearTimeout(timer);
    timer = setTimeout(() => void push(), delayMs);
  }

  async function push() {
    if (!remote) return;
    if (pushing) {
      pushAgain = true;
      return;
    }
    pushing = true;
    try {
      await pushDeletions(remote);
      await pushEdits(remote);
    } catch {
      schedule(RETRY_DELAY_MS);
    } finally {
      pushing = false;
      if (pushAgain) {
        pushAgain = false;
        schedule(0);
      }
    }
  }

  async function pushDeletions(target: ReplyDraftRemote) {
    for (const [threadId, deletedAt] of Object.entries(
      local.current().deleted,
    )) {
      await target.remove({ deletedAt, threadId });
      const { deleted, drafts } = local.current();
      if (deleted[threadId] !== deletedAt) continue;
      local.commit({ deleted: without(deleted, threadId), drafts });
    }
  }

  async function pushEdits(target: ReplyDraftRemote) {
    for (const [threadId, draft] of Object.entries(local.current().drafts)) {
      if (!isReplyDraftUnsynced(draft)) continue;
      const saved = await target.save(toSavedReplyDraft(threadId, draft));
      const latest = local.current();
      // Edited again meanwhile: that edit is sent on the next pass.
      if (saved.updatedAt !== draft.updatedAt) continue;
      if (latest.drafts[threadId] !== draft) continue;
      local.commit({
        ...latest,
        drafts: {
          ...latest.drafts,
          [threadId]: { ...draft, syncedAt: saved.updatedAt },
        },
      });
    }
  }

  function connect(target: ReplyDraftRemote | undefined) {
    remote = target;
    if (target) schedule(0);
    else clearTimeout(timer);
  }

  return { connect, schedule };
}

function toSavedReplyDraft(threadId: string, draft: ReplyDraft) {
  return {
    accountId: draft.accountId,
    attachmentIds: draft.attachments.flatMap((attachment) =>
      attachment.draftAttachmentId ? [attachment.draftAttachmentId] : [],
    ),
    bcc: draft.bcc,
    body: draft.body,
    cc: draft.cc,
    subject: draft.subject,
    threadId,
    to: draft.to,
    updatedAt: draft.updatedAt,
  } satisfies SavedReplyDraft;
}

function hasUnsynced(state: ReplyDraftState) {
  return (
    Object.keys(state.deleted).length > 0 ||
    Object.values(state.drafts).some(isReplyDraftUnsynced)
  );
}

function without<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key),
  );
}
