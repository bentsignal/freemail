import { describe, expect, it } from "vitest";

import type { PasskeySignIn } from "./passkey-sign-in";
import { getPasskeyRemovalBlock, getPasskeySignIn } from "./passkey-sign-in";

function passkeys(...signsInTo: PasskeySignIn[]) {
  return signsInTo.map((target, index) => ({
    id: `${target}-${index}`,
    signsInTo: target,
  }));
}

describe("getPasskeySignIn", () => {
  it("works for the relying party and its subdomains", () => {
    expect(getPasskeySignIn("mail.example.com", "mail.example.com")).toBe(
      "works",
    );
    expect(getPasskeySignIn("example.local", "wt.www.example.local")).toBe(
      "works",
    );
  });

  it("works nowhere for another relying party", () => {
    expect(
      getPasskeySignIn("fake-deployment.convex.site", "mail.example.com"),
    ).toBe("nowhere");
    expect(getPasskeySignIn("ail.example.com", "mail.example.com")).toBe(
      "nowhere",
    );
  });

  it("is unknown without a recorded relying party", () => {
    expect(getPasskeySignIn(undefined, "mail.example.com")).toBe("unknown");
    expect(getPasskeySignIn(null, "mail.example.com")).toBe("unknown");
  });
});

describe("getPasskeyRemovalBlock", () => {
  it("keeps the last working passkey", () => {
    expect(getPasskeyRemovalBlock(passkeys("works"), "works-0")).toBe(
      "This is your only passkey.",
    );
    expect(
      getPasskeyRemovalBlock(passkeys("works", "works"), "works-1"),
    ).toBeUndefined();
  });

  it("doesn't count unknown or old passkeys as a spare", () => {
    expect(
      getPasskeyRemovalBlock(
        passkeys("works", "unknown", "nowhere"),
        "works-0",
      ),
    ).toBe("This is your only passkey.");
  });

  it("keeps an unknown passkey until a working one exists", () => {
    expect(getPasskeyRemovalBlock(passkeys("unknown"), "unknown-0")).toBe(
      "This might be your only passkey. Sign in with it once, or add another passkey first.",
    );
    expect(
      getPasskeyRemovalBlock(passkeys("works", "unknown"), "unknown-1"),
    ).toBeUndefined();
  });

  it("lets an old passkey go", () => {
    expect(
      getPasskeyRemovalBlock(passkeys("nowhere"), "nowhere-0"),
    ).toBeUndefined();
  });

  it("ignores an id it doesn't know", () => {
    expect(
      getPasskeyRemovalBlock(passkeys("works"), "missing"),
    ).toBeUndefined();
  });
});
