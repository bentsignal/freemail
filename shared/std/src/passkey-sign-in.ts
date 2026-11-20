/**
 * Whether a passkey signs in to Freemail. The website and the apps share one
 * relying party, so a passkey either works everywhere or nowhere. "unknown"
 * is a passkey stored before Freemail recorded relying parties; "nowhere" is
 * one made for a relying party Freemail no longer uses, such as the Convex
 * site host the apps used before.
 */
export type PasskeySignIn = "nowhere" | "unknown" | "works";

/**
 * `host` is the relying party itself (on the server) or the website's
 * hostname (in a client), which may be a subdomain of the relying party.
 */
export function getPasskeySignIn(
  rpId: string | null | undefined,
  host: string,
) {
  if (!rpId) return "unknown" as const;
  if (host === rpId || host.endsWith(`.${rpId}`)) return "works" as const;
  return "nowhere" as const;
}

/**
 * Why a passkey can't be removed, or undefined if it can. The last working
 * passkey stays, and an unknown one stays until a working one exists.
 */
export function getPasskeyRemovalBlock(
  passkeys: readonly { id: string; signsInTo: PasskeySignIn }[],
  id: string,
) {
  const target = passkeys.find((passkey) => passkey.id === id);
  if (!target || target.signsInTo === "nowhere") return undefined;
  const hasAnotherWorking = passkeys.some(
    (passkey) => passkey.id !== id && passkey.signsInTo === "works",
  );
  if (hasAnotherWorking) return undefined;
  if (target.signsInTo === "works") return "This is your only passkey.";
  return "This might be your only passkey. Sign in with it once, or add another passkey first.";
}
