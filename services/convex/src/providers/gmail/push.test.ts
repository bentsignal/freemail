import { describe, expect, it } from "vitest";

import { parsePushNotification, pushTokenMatches } from "./pushPayload";

function envelope(payload: unknown) {
  return {
    message: {
      data: btoa(JSON.stringify(payload)),
      messageId: "1",
    },
    subscription: "projects/p/subscriptions/s",
  };
}

describe("Gmail push notifications", () => {
  it("reads the mailbox address from a Pub/Sub envelope", () => {
    expect(
      parsePushNotification(
        envelope({ emailAddress: "Owner@Example.com", historyId: 9 }),
      ),
    ).toEqual({ emailAddress: "owner@example.com" });
  });

  it("rejects envelopes without a usable payload", () => {
    expect(parsePushNotification(null)).toBeNull();
    expect(parsePushNotification({ message: {} })).toBeNull();
    expect(parsePushNotification({ message: { data: "%%%" } })).toBeNull();
    expect(parsePushNotification(envelope({ historyId: 9 }))).toBeNull();
  });

  it("accepts only the configured token", () => {
    expect(pushTokenMatches("secret-token", "secret-token")).toBe(true);
    expect(pushTokenMatches("secret-token", "secret-tokeN")).toBe(false);
    expect(pushTokenMatches("secret-token", "secret")).toBe(false);
    expect(pushTokenMatches("secret-token", null)).toBe(false);
    expect(pushTokenMatches(undefined, "anything")).toBe(false);
  });
});
