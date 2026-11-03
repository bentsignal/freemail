import { describe, expect, it } from "vitest";

import { isMailtoUrl, mailtoComposeHref, parseMailto } from "./mailto";

describe("isMailtoUrl", () => {
  it("matches the scheme in any case and nothing else", () => {
    expect(isMailtoUrl("mailto:a@example.com")).toBe(true);
    expect(isMailtoUrl("MAILTO:a@example.com")).toBe(true);
    expect(isMailtoUrl("rodge-mail://provider-complete")).toBe(false);
    expect(isMailtoUrl("/compose?to=mailto:a@example.com")).toBe(false);
  });
});

describe("parseMailto", () => {
  it("reads every field", () => {
    expect(
      parseMailto(
        "mailto:a@example.com?cc=b@example.com&bcc=c@example.com&subject=Hello%20there&body=Line%20one%0D%0ALine%20two",
      ),
    ).toEqual({
      bcc: "c@example.com",
      body: "Line one\nLine two",
      cc: "b@example.com",
      subject: "Hello there",
      to: "a@example.com",
    });
  });

  it("joins recipients from the address and repeated headers", () => {
    expect(
      parseMailto("mailto:a@example.com,b@example.com?to=c@example.com").to,
    ).toBe("a@example.com,b@example.com, c@example.com");
  });

  it("keeps a literal plus in addresses and text", () => {
    expect(parseMailto("mailto:a+tag@example.com?subject=1+1")).toEqual({
      subject: "1+1",
      to: "a+tag@example.com",
    });
  });

  it("accepts headers without a recipient and in any case", () => {
    expect(parseMailto("mailto:?SUBJECT=Hi&To=a%40example.com")).toEqual({
      subject: "Hi",
      to: "a@example.com",
    });
  });

  it("ignores headers the composer has no field for", () => {
    expect(
      parseMailto("mailto:a@example.com?in-reply-to=x&attachment=/etc/passwd"),
    ).toEqual({ to: "a@example.com" });
  });

  it("keeps malformed escapes as written", () => {
    expect(parseMailto("mailto:a@example.com?subject=100%")).toEqual({
      subject: "100%",
      to: "a@example.com",
    });
  });

  it("handles an empty link", () => {
    expect(parseMailto("mailto:")).toEqual({});
  });
});

describe("mailtoComposeHref", () => {
  it("opens an empty composer for an empty link", () => {
    expect(mailtoComposeHref("mailto:")).toBe("/compose");
  });

  it("encodes values so they survive the route", () => {
    expect(
      mailtoComposeHref("mailto:a+tag@example.com?subject=Q%26A%20time"),
    ).toBe("/compose?to=a%2Btag%40example.com&subject=Q%26A%20time");
  });
});
