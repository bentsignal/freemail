import { describe, expect, it } from "vitest";

import { getReplyAddress, getReplyRecipient } from "./reply";

const owner = "owner@example.com";

describe("reply recipient selection", () => {
  it("prefers the first non-self Reply-To address", () => {
    expect(
      getReplyAddress(
        [
          {
            from: { address: "sender@example.com" },
            replyTo: [
              { address: owner },
              { address: "replies@example.com" },
              { address: "other@example.com" },
            ],
            to: [{ address: owner }],
          },
        ],
        owner,
      ),
    ).toBe("replies@example.com");
  });

  it("uses a non-self To recipient for an outgoing-only thread", () => {
    expect(
      getReplyAddress(
        [
          {
            from: { address: owner },
            to: [{ address: owner }, { address: "recipient@example.com" }],
          },
        ],
        owner,
      ),
    ).toBe("recipient@example.com");
  });

  it("returns undefined when a thread contains only the owner", () => {
    expect(
      getReplyAddress(
        [
          {
            from: { address: owner },
            replyTo: [{ address: owner }],
            to: [{ address: owner }],
          },
        ],
        owner,
      ),
    ).toBeUndefined();
  });
});

describe("reply recipient name", () => {
  it("names the sender being replied to", () => {
    expect(
      getReplyRecipient(
        [
          {
            from: { address: "maya@example.com", name: "Maya Chen" },
            to: [{ address: owner }],
          },
        ],
        owner,
      ),
    ).toEqual({ address: "maya@example.com", name: "Maya Chen" });
  });

  it("finds the name elsewhere in the thread when the reply address has none", () => {
    expect(
      getReplyRecipient(
        [
          {
            from: { address: "maya@example.com", name: "Maya Chen" },
            to: [{ address: owner }],
          },
          {
            from: { address: owner },
            to: [{ address: "maya@example.com" }],
          },
        ],
        owner,
      ),
    ).toEqual({ address: "maya@example.com", name: "Maya Chen" });
  });

  it("leaves the name out when nobody in the thread gives one", () => {
    expect(
      getReplyRecipient(
        [{ from: { address: "maya@example.com" }, to: [{ address: owner }] }],
        owner,
      ),
    ).toEqual({ address: "maya@example.com", name: undefined });
  });
});
