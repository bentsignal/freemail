import type { Href } from "expo-router";
import { DevSettings } from "react-native";
import { router } from "expo-router";

import { signInAsTestOwner } from "~/features/auth/test-owner-sign-in";
import { devMailActions } from "./dev-mail-actions";
import { frameReport, startFrames, stopFrames } from "./frames";
import { startupTimings } from "./startup-timing";

function isAppPath(path: string): path is Href & string {
  return path.startsWith("/");
}

let signInStatus = "idle";

/**
 * Starts sign-in and returns at once: Hermes' `Runtime.evaluate` can't wait
 * on a promise, so `scripts/sim.sh signin` polls `signInStatus()` instead.
 */
function signIn() {
  if (signInStatus === "pending") return signInStatus;
  signInStatus = "pending";
  signInAsTestOwner().then(
    (email) => (signInStatus = `signed in as ${email}`),
    (error: unknown) =>
      (signInStatus = `failed: ${error instanceof Error ? error.message : String(error)}`),
  );
  return signInStatus;
}

/**
 * Debug and profile bundles only: lets `scripts/sim.sh` navigate, reload,
 * sign in, and measure frames and startup over Metro's debugger connection. iOS asks "Open in Freemail
 * Mail?" before every `simctl openurl`, which scripts cannot answer.
 */
export function installDevAutomation() {
  if (!__DEV__ && process.env.EXPO_PUBLIC_FREEMAIL_PROFILE_BUNDLE !== "1") {
    return;
  }
  Object.assign(globalThis, {
    freemailDev: {
      open(path: string) {
        if (!path.startsWith("/")) throw new Error(`Not an app path: ${path}`);
        if (isAppPath(path)) router.push(path);
      },
      reload() {
        DevSettings.reload();
      },
      signIn,
      signInStatus: () => signInStatus,
      frames: { report: frameReport, start: startFrames, stop: stopFrames },
      timings: () => JSON.stringify(startupTimings()),
      /** The inbox's rows by index: `mail.pin(0)`, `archive`, `read`; `select()` toggles selection mode. */
      mail: {
        archive: (index: number) => devMailActions()?.archive(index),
        pin: (index: number) => devMailActions()?.pin(index),
        read: (index: number) => devMailActions()?.read(index),
        select: () => devMailActions()?.select(),
      },
    },
  });
}
