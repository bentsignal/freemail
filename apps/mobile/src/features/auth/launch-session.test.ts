import { describe, expect, it } from "vitest";

import { getTokenExpiry, isSavedSessionLive } from "./launch-session";

function jwt(claims: object) {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
  return `header.${payload}.signature`;
}

describe("token expiry", () => {
  it("reads a JWT's expiry in milliseconds, unpadded", () => {
    expect(getTokenExpiry(jwt({ exp: 1_800_000_000, sub: "a" }))).toBe(
      1_800_000_000_000,
    );
    expect(getTokenExpiry(jwt({ exp: 1_800_000_001, sub: "ab" }))).toBe(
      1_800_000_001_000,
    );
  });

  it("refuses anything that isn't a JWT with an expiry", () => {
    expect(getTokenExpiry("not a token")).toBeUndefined();
    expect(getTokenExpiry("a.!!!.c")).toBeUndefined();
    expect(getTokenExpiry(jwt({ sub: "no expiry" }))).toBeUndefined();
  });
});

describe("saved session", () => {
  const now = Date.parse("2026-11-22T12:00:00Z");
  function saved(expiresAt: string) {
    return JSON.stringify({
      session: { expiresAt, id: "session" },
      user: { id: "user" },
    });
  }

  it("counts an unexpired session", () => {
    expect(isSavedSessionLive(saved("2026-11-29T12:00:00Z"), now)).toBe(true);
  });

  it("doesn't count an expired, empty, or signed-out one", () => {
    expect(isSavedSessionLive(saved("2026-11-21T12:00:00Z"), now)).toBe(false);
    expect(isSavedSessionLive(null, now)).toBe(false);
    expect(isSavedSessionLive("{}", now)).toBe(false);
    expect(isSavedSessionLive("not json", now)).toBe(false);
  });
});
