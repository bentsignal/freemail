import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";

import type { SavedInbox, SavedInboxFile } from "./lib/saved-inbox-file";
import { parseSavedInbox, SAVED_INBOX_VERSION } from "./lib/saved-inbox-file";

const SAVED_ROWS = 30;

let unsaved: SavedInbox | undefined;
let forgotten = false;
let launchInbox: SavedInbox | null | undefined;

function savedInboxFile() {
  // The cache directory: never backed up, and the OS may clear it, which
  // only costs the next open its head start.
  return new File(Paths.cache, "saved-inbox.json");
}

/**
 * The unified inbox's first page and the accounts, as the app last showed
 * them, so a cold open draws the inbox at once while the live query
 * catches up. Read from disk once per launch.
 */
export function savedInboxAtLaunch() {
  launchInbox ??= readSavedInbox() ?? null;
  return launchInbox ?? undefined;
}

function readSavedInbox() {
  try {
    const file = savedInboxFile();
    if (!file.exists) return undefined;
    return parseSavedInbox(file.textSync());
  } catch {
    return undefined;
  }
}

/** Keeps the live inbox to save the next time the app leaves the screen. */
export function keepInboxForSaving(inbox: SavedInbox) {
  if (forgotten) return;
  unsaved = {
    accounts: inbox.accounts,
    threads: inbox.threads.slice(0, SAVED_ROWS),
  };
}

/** Signing out (or a session the server no longer has) deletes it. */
export function forgetSavedInbox() {
  forgotten = true;
  unsaved = undefined;
  launchInbox = null;
  try {
    const file = savedInboxFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing saved, or the OS already cleared its cache.
  }
}

/** A new sign-in saves again. */
export function rememberInbox() {
  forgotten = false;
}

function writeUnsaved() {
  if (!unsaved) return;
  const contents = {
    ...unsaved,
    version: SAVED_INBOX_VERSION,
  } satisfies SavedInboxFile;
  unsaved = undefined;
  try {
    savedInboxFile().write(JSON.stringify(contents));
  } catch {
    // The next open loads live, as it did before saving existed.
  }
}

// Saved as the app leaves the screen ("inactive" too: an app closed from the
// app switcher is only inactive), never while it's in use.
AppState.addEventListener("change", (state) => {
  if (state !== "active") writeUnsaved();
});
