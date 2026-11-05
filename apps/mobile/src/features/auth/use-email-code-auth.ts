import { useState } from "react";

import { completeAuthSession } from "@rodge-mail/std/auth-session";

import { authClient } from "./client";

/**
 * Rodge Dev signs in with the passkey recovery code until its app ID is in
 * the Apple app-site association on dazzling-dog-633 (docs/phone-testing.md).
 * The code and the session come from the server, so each step waits on it.
 */
export function useEmailCodeAuth() {
  const [codeSentTo, setCodeSentTo] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    setMessage(undefined);
    let succeeded = false;
    try {
      await action();
      succeeded = true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed");
    }
    setIsBusy(false);
    return succeeded;
  }

  async function sendCode(email: string) {
    const normalized = email.trim().toLowerCase();
    const sent = await run(async () => {
      const result = await authClient.$fetch("/passkey-recovery/request", {
        body: { email: normalized },
        method: "POST",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not send the code");
      }
    });
    if (sent) setCodeSentTo(normalized);
  }

  function verifyCode(code: string) {
    return run(async () => {
      if (!codeSentTo) return;
      await completeAuthSession({
        authenticate: async () =>
          await authClient.$fetch("/passkey-recovery/verify", {
            body: { code: code.trim(), email: codeSentTo },
            method: "POST",
          }),
        confirmSession: async () => await authClient.getSession(),
        fallbackMessage: "The code is invalid or expired",
        refreshSession: () => authClient.$store.notify("$sessionSignal"),
      });
    });
  }

  return { codeSentTo, isBusy, message, sendCode, verifyCode };
}
