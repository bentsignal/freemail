import { useSyncExternalStore } from "react";

import type { Id } from "@freemail/convex/model";
import type { ComposerDraft, ReplyDrafts } from "@freemail/features/mail";
import {
  isReplyDraftWorthKeeping,
  parseReplyDrafts,
  serializeReplyDrafts,
  toComposerDraft,
  toReplyDraft,
  withoutReplyDraft,
} from "@freemail/features/mail";

const STORAGE_KEY = "freemail:reply-drafts";

let drafts: ReplyDrafts | undefined;
const listeners = new Set<() => void>();

function loaded() {
  if (typeof window === "undefined") return {};
  drafts ??= readStoredDrafts();
  return drafts;
}

function readStoredDrafts() {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    return text ? parseReplyDrafts(text) : {};
  } catch {
    return {};
  }
}

function change(next: ReplyDrafts) {
  drafts = next;
  notify();
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, serializeReplyDrafts(next));
    }
  } catch {
    // Storage is full or blocked: the draft lasts until the tab closes.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The unsent reply to a thread, kept in this browser until it's sent. */
export function useReplyDraft(threadId: string) {
  return useSyncExternalStore(
    subscribe,
    () => loaded()[threadId],
    () => undefined,
  );
}

export function readReplyDraft(threadId: string) {
  const saved = loaded()[threadId];
  if (!saved) return undefined;
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Saved from a loaded account; the composer checks it against the account list before sending.
    accountId: saved.accountId as Id<"mailAccounts"> | undefined,
    draft: toComposerDraft(saved, Date.now()),
  };
}

export function saveReplyDraft(
  threadId: string,
  draft: ComposerDraft,
  accountId: string | undefined,
) {
  if (!isReplyDraftWorthKeeping(draft)) {
    deleteReplyDraft(threadId);
    return;
  }
  const current = loaded();
  change({
    ...current,
    [threadId]: toReplyDraft({
      accountId,
      draft,
      now: Date.now(),
      previous: current[threadId],
    }),
  });
}

export function deleteReplyDraft(threadId: string) {
  const current = loaded();
  if (!(threadId in current)) return;
  change(withoutReplyDraft(current, threadId));
}

/** Signing out deletes every draft with the rest of the account's data. */
export function forgetReplyDrafts() {
  change({});
}

// Another tab changed the drafts: read them again.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    drafts = undefined;
    notify();
  });
}
