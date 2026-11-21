import { expoPasskeyClient } from "expo-better-auth-passkey";
import * as SecureStore from "expo-secure-store";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ConvexReactClient } from "convex/react";

import { nativeAuthBasePath } from "@freemail/config/auth";
import { createUrls } from "@freemail/config/urls";

import { isFreemailDev } from "../dev/app-variant";

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
  ],
});

export const convex = new ConvexReactClient(urls.convex.cloud, {
  expectAuth: true,
  unsavedChangesWarning: false,
});
