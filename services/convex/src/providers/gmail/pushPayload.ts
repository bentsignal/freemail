/* eslint-disable @typescript-eslint/consistent-type-assertions -- Pub/Sub envelopes are untrusted JSON checked field by field. */
export function parsePushNotification(body: unknown) {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== "string") return null;
  try {
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(data.replace(/-/g, "+").replace(/_/g, "/")),
          (character) => character.charCodeAt(0),
        ),
      ),
    ) as { emailAddress?: unknown; historyId?: unknown };
    if (typeof decoded.emailAddress !== "string") return null;
    return { emailAddress: decoded.emailAddress.trim().toLowerCase() };
  } catch {
    return null;
  }
}

export function pushTokenMatches(
  expected: string | undefined,
  received: string | null,
) {
  if (!expected || !received || expected.length !== received.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}
