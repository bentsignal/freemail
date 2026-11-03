import { describe, expect, it } from "vitest";

import { findVerificationCode } from "./verificationCode";

describe("findVerificationCode", () => {
  it.each([
    ["Your verification code is 483920", "483920"],
    ["Your verification code is:\n\n483920\n\nIt expires soon.", "483920"],
    ["Security code: 4839", "4839"],
    ["Use this code to sign in: 483920", "483920"],
    ["Your code is 483920", "483920"],
    ["Your code: 483920", "483920"],
    ["Enter the code below\n\n483920", "483920"],
    ["Your login code is 12345678", "12345678"],
    ["Your sign-in code\n483 920", "483920"],
    ["One-time passcode: 483-920", "483920"],
    ["Your OTP is 483920.", "483920"],
    ["483920 is your Instagram code", "483920"],
    ["G-483920 is your Google verification code.", "483920"],
    ["Your confirmation code: ABC123", "ABC123"],
    ["Your verification code is 7KQ2M9", "7KQ2M9"],
  ])("finds the code in %j", (text, code) => {
    expect(findVerificationCode(text)).toBe(code);
  });

  it.each([
    "Launch plan 222302",
    "Invoice 333403 is ready",
    "Order confirmation 483920",
    "Your order number is 483920",
    "Call us at 800-555-0100 about your code",
    "Your verification code expires in 10 minutes",
    "Your security code changed in 2026",
    "Use your promo code 483920 at checkout",
    "483920 is your discount code",
    "Your verification code is 48.39",
    "Your verification code is $4839",
    "Your code review for PR 12345 is ready",
    "Re: the code in PR 4521",
    "This code ships in release 12345",
    "12345 is your order code",
    "Your confirmation code: review",
    "Your confirmation code: REVIEW",
    "The meeting moved to 2 pm",
    "",
  ])("finds nothing in %j", (text) => {
    expect(findVerificationCode(text)).toBeUndefined();
  });

  it("skips a year and keeps looking", () => {
    expect(
      findVerificationCode(
        "Your code © 2026 Acme\nYour verification code is 483920",
      ),
    ).toBe("483920");
  });

  it("stops looking in very long mail", () => {
    expect(
      findVerificationCode(
        `${"x ".repeat(10_000)}Your verification code is 483920`,
      ),
    ).toBeUndefined();
  });
});
