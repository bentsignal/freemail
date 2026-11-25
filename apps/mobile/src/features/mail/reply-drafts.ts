import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";

import type { ComposerDraft } from "@freemail/features/mail";

import type { ReplyDrafts } from "./lib/reply-drafts-file";
import type { NativeComposerAttachment } from "./screens/use-native-attachments";
import {
  isWorthKeeping,
  parseReplyDrafts,
  serializeReplyDrafts,
  toComposerDraft,
  toReplyDraft,
} from "./lib/reply-drafts-file";

let drafts: ReplyDrafts | undefined;
let unsaved = false;
let notifying = false;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
const WRITE_DELAY_MS = 500;
const listeners = new Set<() => void>();

function draftsFile() {
  // Documents, not the cache: the OS may clear the cache, and a draft is
  // something written by hand.
  return new File(Paths.document, "reply-drafts.json");
}

function loaded() {
  drafts ??= readDrafts();
  return drafts;
}

function readDrafts() {
  try {
    const file = draftsFile();
    if (!file.exists) return {};
    return parseReplyDrafts(file.textSync());
  } catch {
    return {};
  }
}

function change(next: ReplyDrafts) {
  drafts = next;
  unsaved = true;
  notify();
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeUnsaved, WRITE_DELAY_MS);
}

// The composer saves from its state updates, which React may run while
// rendering, so subscribers hear about it once that render is done.
function notify() {
  if (notifying) return;
  notifying = true;
  queueMicrotask(() => {
    notifying = false;
    for (const listener of listeners) listener();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The unsent reply to a thread, kept on this device until it's sent. */
export function useReplyDraft(threadId: string) {
  return useSyncExternalStore(subscribe, () => loaded()[threadId]);
}

export function readReplyDraft(threadId: string) {
  const saved = loaded()[threadId];
  if (!saved) return undefined;
  return {
    accountId: saved.accountId,
    draft: toComposerDraft(saved, Date.now()),
  };
}

export function saveReplyDraft(
  threadId: string,
  draft: ComposerDraft<NativeComposerAttachment>,
  accountId: string | undefined,
) {
  if (!isWorthKeeping(draft)) {
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
  change(
    Object.fromEntries(
      Object.entries(current).filter(([key]) => key !== threadId),
    ),
  );
}

/** Signing out deletes every draft with the rest of the account's data. */
export function forgetReplyDrafts() {
  drafts = {};
  unsaved = false;
  clearTimeout(writeTimer);
  notify();
  try {
    const file = draftsFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing saved.
  }
}

function writeUnsaved() {
  clearTimeout(writeTimer);
  if (!unsaved || !drafts) return;
  unsaved = false;
  try {
    draftsFile().write(serializeReplyDrafts(drafts));
  } catch {
    unsaved = true;
  }
}

// Written shortly after typing pauses, and at once as the app leaves the
// screen ("inactive" too: an app closed from the app switcher is only
// inactive).
AppState.addEventListener("change", (state) => {
  if (state !== "active") writeUnsaved();
});
