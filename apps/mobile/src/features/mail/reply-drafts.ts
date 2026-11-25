import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";

import type { ComposerDraft, ReplyDrafts } from "@freemail/features/mail";
import {
  isReplyDraftWorthKeeping,
  parseReplyDrafts,
  serializeReplyDrafts,
  toComposerDraft,
  toReplyDraft,
  withoutReplyDraft,
} from "@freemail/features/mail";

import type { NativeComposerAttachment } from "./screens/use-native-attachments";

let drafts: ReplyDrafts<NativeComposerAttachment> | undefined;
let unsaved = false;
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
    return parseReplyDrafts<NativeComposerAttachment>(file.textSync());
  } catch {
    return {};
  }
}

function change(next: ReplyDrafts<NativeComposerAttachment>) {
  drafts = next;
  unsaved = true;
  notify();
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeUnsaved, WRITE_DELAY_MS);
}

function notify() {
  for (const listener of listeners) listener();
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
