/** When a JWT expires, in milliseconds, or undefined if it isn't one. */
export function getTokenExpiry(token: string) {
  const payload = token.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const base64 = payload
      .replace(/-/gu, "+")
      .replace(/_/gu, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return readExpiry(JSON.parse(atob(base64)));
  } catch {
    return undefined;
  }
}

function readExpiry(claims: unknown) {
  if (
    typeof claims === "object" &&
    claims !== null &&
    "exp" in claims &&
    typeof claims.exp === "number"
  ) {
    return claims.exp * 1000;
  }
  return undefined;
}

/**
 * Whether better-auth's expo plugin has an unexpired session saved on the
 * device (the same check it makes to restore one at launch).
 */
export function isSavedSessionLive(saved: string | null, now: number) {
  if (saved === null) return false;
  try {
    return readSessionIsLive(JSON.parse(saved), now);
  } catch {
    return false;
  }
}

function readSessionIsLive(saved: unknown, now: number) {
  if (
    typeof saved !== "object" ||
    saved === null ||
    !("session" in saved) ||
    !("user" in saved)
  ) {
    return false;
  }
  const { session, user } = saved;
  return (
    hasId(user) &&
    hasId(session) &&
    "expiresAt" in session &&
    (typeof session.expiresAt === "string" ||
      typeof session.expiresAt === "number") &&
    new Date(session.expiresAt).getTime() > now
  );
}

function hasId(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}
