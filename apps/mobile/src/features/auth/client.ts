import type { BetterAuthClientPlugin } from "better-auth/client";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ConvexReactClient } from "convex/react";

import { nativeAuthBasePath } from "@freemail/config/auth";
import { createUrls } from "@freemail/config/urls";

import { isFreemailDev } from "../dev/app-variant";
import { markStartup } from "../dev/startup-timing";
import { forgetSavedInbox, rememberInbox } from "../mail/saved-inbox";
import {
  forgetSavedToken,
  hasSavedSession,
  readSavedToken,
  saveToken,
} from "./saved-token";

// Freemail uses production. Freemail Dev (the phone's dev client and the
// simulators) never does: it uses this worktree's isolated backend when
// scripts/backend.sh isolate made one, otherwise the development deployment.
const urls = createUrls({
  nodeEnv: isFreemailDev ? "development" : "production",
});
export const convexUrls = urls.convex;
export const webUrl = urls.web;

export const authClient = createAuthClient({
  baseURL: urls.convex.site,
  basePath: nativeAuthBasePath,
  plugins: [
    expoClient({
      cookiePrefix: "better-auth",
      scheme: "rodge-mail",
      storage: SecureStore,
      storagePrefix: "rodge-mail",
    }),
    expoPasskeyClient(),
    convexClient(),
    savedSessionClient(),
  ],
});

/**
 * Saves each Convex token the app fetches (saved-token.ts), and forgets it
 * and the saved inbox when the session ends: on signing out, or when the
 * server no longer has the session.
 */
function savedSessionClient() {
  return {
    id: "freemail-saved-session",
    fetchPlugins: [
      {
        id: "freemail-saved-session",
        name: "Freemail saved session",
        hooks: {
          onSuccess(context) {
            onAuthResponse(context.request.url.toString(), context.data);
          },
        },
        init(url, options) {
          if (url.includes("/sign-out")) forgetSavedSession();
          return { options, url };
        },
      },
    ],
  } satisfies BetterAuthClientPlugin;
}

function onAuthResponse(url: string, data: unknown) {
  if (url.includes("/convex/token")) {
    saveToken(
      typeof data === "object" && data !== null && "token" in data
        ? data.token
        : undefined,
    );
  } else if (url.includes("/get-session")) {
    if (hasSession(data)) rememberInbox();
    else forgetSavedSession();
  }
}

function hasSession(data: unknown) {
  return (
    typeof data === "object" &&
    data !== null &&
    "session" in data &&
    typeof data.session === "object" &&
    data.session !== null
  );
}

function forgetSavedSession() {
  forgetSavedToken();
  forgetSavedInbox();
}

/** The saved Convex token, if it's still valid (saved-token.ts). */
export const launchToken = readSavedToken();

/**
 * Whether the app opened with a session on the device (better-auth's expo
 * plugin restores it synchronously). Such an open shows the signed-in app at
 * once, with the saved inbox, instead of waiting on the server to confirm it.
 */
export const launchedSignedIn = launchToken !== null || hasSavedSession();

export const convex = new ConvexReactClient(urls.convex.cloud, {
  expectAuth: true,
  // The token the app opens with is good for this connection; fetching a
  // fresh one at once re-authenticates, which re-runs every query.
  initialAuthTokenReuse: true,
  unsavedChangesWarning: false,
});

convex.subscribeToConnectionState((state) =>
  markStartup("socketOpen", state.isWebSocketConnected),
);
