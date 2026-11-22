import * as SecureStore from "expo-secure-store";

import { getTokenExpiry, isSavedSessionLive } from "./launch-session";

const TOKEN_KEY = "rodge-mail.convex-token";
/** Where better-auth's expo plugin saves the session (storagePrefix). */
const SESSION_KEY = "rodge-mail_session_data";
/** A saved token closer to expiring than this is fetched afresh instead. */
const MIN_REMAINING_MS = 60_000;

/**
 * The Convex token from the last time the app had one, while it's still
 * valid, so a cold open authenticates its websocket at once instead of
 * waiting on a token request first.
 */
export function readSavedToken(now = Date.now()) {
  try {
    const token = SecureStore.getItem(TOKEN_KEY);
    if (token === null) return null;
    const expiresAt = getTokenExpiry(token);
    if (expiresAt === undefined || expiresAt - now < MIN_REMAINING_MS) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function saveToken(token: unknown) {
  if (typeof token !== "string" || getTokenExpiry(token) === undefined) {
    forgetSavedToken();
    return;
  }
  SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);
}

export function forgetSavedToken() {
  SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

/** Whether the device has a session saved, unexpired. */
export function hasSavedSession(now = Date.now()) {
  try {
    return isSavedSessionLive(SecureStore.getItem(SESSION_KEY), now);
  } catch {
    return false;
  }
}
