import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";

import type { ComposerDraft, ReplyDraftRemote } from "@freemail/features/mail";
import {
  createReplyDraftStore,
  toComposerDraft,
} from "@freemail/features/mail";

import type { NativeComposerAttachment } from "./screens/use-native-attachments";

const WRITE_DELAY_MS = 500;
let unsaved: string | undefined;
let writeTimer: ReturnType<typeof setTimeout> | undefined;

function draftsFile() {
  // Documents, not the cache: the OS may clear the cache, and a draft is
  // something written by hand.
  return new File(Paths.document, "reply-drafts.json");
}

function writeUnsaved() {
  clearTimeout(writeTimer);
  if (unsaved === undefined) return;
  try {
    draftsFile().write(unsaved);
    unsaved = undefined;
  } catch {
    // Kept in memory; the next write tries again.
  }
}

const store = createReplyDraftStore({
  storage: {
    read: () => {
      const file = draftsFile();
      return file.exists ? file.textSync() : undefined;
    },
    // Written shortly after typing pauses, and at once as the app leaves
    // the screen.
    write: (text) => {
      unsaved = text;
      clearTimeout(writeTimer);
      writeTimer = setTimeout(writeUnsaved, WRITE_DELAY_MS);
    },
  },
});

// "inactive" too: an app closed from the app switcher is only inactive.
AppState.addEventListener("change", (state) => {
  if (state !== "active") writeUnsaved();
});

/** The unsent reply to a thread, synced with the user's other devices. */
export function useReplyDraft(threadId: string) {
  return useSyncExternalStore(store.subscribe, () => store.get(threadId));
}

/** Changes when another device edits the thread's reply. */
export function useReplyDraftEditVersion(threadId: string | undefined) {
  return useSyncExternalStore(store.subscribe, () =>
    threadId ? store.getEditVersion(threadId) : 0,
  );
}

export function readReplyDraft(threadId: string) {
  const saved = store.get(threadId);
  if (!saved) return undefined;
  const draft = toComposerDraft(saved);
  return {
    accountId: saved.accountId,
    draft: {
      ...draft,
      // Uploaded already: the local file is only needed to upload.
      attachments: draft.attachments.map((attachment) => ({
        uri: "",
        ...attachment,
      })),
    } satisfies ComposerDraft<NativeComposerAttachment>,
  };
}

export function saveReplyDraft(
  threadId: string,
  draft: ComposerDraft<NativeComposerAttachment>,
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

/** Signing out deletes this device's copy of every draft. */
export function forgetReplyDrafts() {
  store.forget();
  writeUnsaved();
}
