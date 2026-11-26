/* eslint-disable @typescript-eslint/consistent-type-assertions -- Saved account IDs come from the loaded account list; the composer checks them against it before sending. */
import { useSyncExternalStore } from "react";

import type { Id } from "@freemail/convex/model";
import type { ComposerDraft, ReplyDraftRemote } from "@freemail/features/mail";
import {
  createReplyDraftStore,
  toComposerDraft,
} from "@freemail/features/mail";

const STORAGE_KEY = "freemail:reply-drafts";

const store = createReplyDraftStore({
  storage: {
    read: () =>
      typeof window === "undefined"
        ? undefined
        : window.localStorage.getItem(STORAGE_KEY),
    write: (text) => window.localStorage.setItem(STORAGE_KEY, text),
  },
});

/** The unsent reply to a thread, synced with the user's other devices. */
export function useReplyDraft(threadId: string) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(threadId),
    () => undefined,
  );
}

/** Changes when another device edits the thread's reply. */
export function useReplyDraftEditVersion(threadId: string | undefined) {
  return useSyncExternalStore(
    store.subscribe,
    () => (threadId ? store.getEditVersion(threadId) : 0),
    () => 0,
  );
}

export function readReplyDraft(threadId: string) {
  const saved = store.get(threadId);
  if (!saved) return undefined;
  return {
    accountId: saved.accountId as Id<"mailAccounts"> | undefined,
    draft: toComposerDraft(saved),
  };
}

export function saveReplyDraft(
  threadId: string,
  draft: ComposerDraft,
  accountId: string | undefined,
) {
  store.save(threadId, draft, accountId);
}

export function deleteReplyDraft(threadId: string) {
  store.remove(threadId);
}

export function applyServerReplyDrafts(
  rows: Parameters<typeof store.applyServer>[0],
) {
  store.applyServer(rows);
}

export function connectReplyDrafts(remote: ReplyDraftRemote | undefined) {
  store.connect(remote);
}

/** Signing out deletes this browser's copy of every draft. */
export function forgetReplyDrafts() {
  store.forget();
}
