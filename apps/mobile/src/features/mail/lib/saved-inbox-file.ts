import type { MobileMailAccount, MobileMailThread } from "./convex-mail";

/** Bumped when the saved shape changes, so an older file is ignored. */
export const SAVED_INBOX_VERSION = 1;

export interface SavedInbox {
  accounts: MobileMailAccount[];
  threads: MobileMailThread[];
}

export interface SavedInboxFile extends SavedInbox {
  version: typeof SAVED_INBOX_VERSION;
}

export function parseSavedInbox(text: string) {
  const saved = toSavedInbox(JSON.parse(text));
  return saved && { accounts: saved.accounts, threads: saved.threads };
}

function toSavedInbox(saved: unknown) {
  return isSavedInboxFile(saved) ? saved : undefined;
}

function isSavedInboxFile(saved: unknown): saved is SavedInboxFile {
  return (
    typeof saved === "object" &&
    saved !== null &&
    "version" in saved &&
    saved.version === SAVED_INBOX_VERSION &&
    "threads" in saved &&
    Array.isArray(saved.threads) &&
    "accounts" in saved &&
    Array.isArray(saved.accounts)
  );
}
