import { describe, expect, it, vi } from "vitest";

import { createFixture, ownerEmail, wrongCode } from "./emailCodeAuth.fixtures";

vi.mock("./registrationEmail", () => ({
  sendRecoveryEmail: () => Promise.resolve(),
  sendRegistrationEmail: () => Promise.resolve(),
}));

describe("email OTP routes", () => {
  it("issues no code to an account with a passkey", async () => {
    const fixture = createFixture();

    const response = await fixture.post("/email-otp/send-verification-otp", {
      email: ownerEmail,
      type: "sign-in",
    });

    expect(response).toMatchObject({ body: { success: true }, status: 200 });
    expect(fixture.issuedCodes).toHaveLength(0);
    expect(fixture.db.verification).toHaveLength(0);
  });

  it("answers an unknown address exactly as a known one", async () => {
    const fixture = createFixture();

    const known = await fixture.post("/email-otp/send-verification-otp", {
      email: ownerEmail,
      type: "sign-in",
    });
    const unknown = await fixture.post("/email-otp/send-verification-otp", {
      email: "someone@example.com",
      type: "sign-in",
    });

    expect(unknown).toEqual(known);
    expect(fixture.db.verification).toHaveLength(0);
  });

  it("refuses a correct code for an account with a passkey", async () => {
    const fixture = createFixture();
    const otp = await fixture.withAuth((auth) =>
      auth.api.createVerificationOTP({
        body: { email: ownerEmail, type: "sign-in" },
      }),
    );
    expect(fixture.db.verification).toHaveLength(1);

    const response = await fixture.post("/sign-in/email-otp", {
      email: ownerEmail,
      otp,
    });

    expect(response.status).toBe(400);
    expect(response.setCookie).toBeNull();
    expect(fixture.db.session).toHaveLength(0);
    expect(fixture.db.verification).toHaveLength(0);
  });

  it.each(["email-verification", "forget-password", "change-email"])(
    "issues no %s code",
    async (type) => {
      const fixture = createFixture({ hasPasskey: false });

      const response = await fixture.post("/email-otp/send-verification-otp", {
        email: ownerEmail,
        type,
      });

      expect(response.status).toBe(400);
      expect(fixture.issuedCodes).toHaveLength(0);
      expect(fixture.db.verification).toHaveLength(0);
    },
  );

  it.each([
    ["/email-otp/check-verification-otp", "sign-in", { type: "sign-in" }],
    ["/email-otp/verify-email", "email-verification", {}],
    ["/email-otp/request-password-reset", "forget-password", {}],
    ["/forget-password/email-otp", "forget-password", {}],
    [
      "/email-otp/reset-password",
      "forget-password",
      { password: "a-new-password-123" },
    ],
    [
      "/email-otp/request-email-change",
      "change-email",
      { newEmail: "new@example.com" },
    ],
    [
      "/email-otp/change-email",
      "change-email",
      { newEmail: "new@example.com" },
    ],
  ] as const)("closes %s", async (path, type, extra) => {
    for (const hasPasskey of [true, false]) {
      const fixture = createFixture({ hasPasskey });
      const otp = await fixture.withAuth((auth) =>
        auth.api.createVerificationOTP({ body: { email: ownerEmail, type } }),
      );

      const responses = await Promise.all(
        [ownerEmail, "someone@example.com"].map((email) =>
          fixture.post(path, { email, otp, ...extra }),
        ),
      );

      for (const response of responses) {
        expect(response.status).toBe(404);
      }
      expect(responses[0]).toEqual(responses[1]);
      expect(fixture.db.account).toHaveLength(0);
      expect(fixture.db.session).toHaveLength(0);
      expect(fixture.db.user[0]?.email).toBe(ownerEmail);
    }
  });
});

describe("registration codes for an account without a passkey", () => {
  it("still lets the account finish signing up", async () => {
    const fixture = createFixture({ hasPasskey: false });

    await fixture.post("/email-otp/send-verification-otp", {
      email: ownerEmail,
      type: "sign-in",
    });
    const response = await fixture.post("/sign-in/email-otp", {
      email: ownerEmail,
      otp: fixture.issuedCodes[0],
    });

    expect(response.status).toBe(200);
    expect(fixture.db.session).toHaveLength(1);
  });

  it("does not spend the attempt budget while no code is pending", async () => {
    const fixture = createFixture({ hasPasskey: false });

    for (let attempt = 0; attempt < 30; attempt++) {
      await fixture.post("/sign-in/email-otp", {
        email: ownerEmail,
        otp: "000000",
      });
    }
    await fixture.post("/email-otp/send-verification-otp", {
      email: ownerEmail,
      type: "sign-in",
    });
    const response = await fixture.post("/sign-in/email-otp", {
      email: ownerEmail,
      otp: fixture.issuedCodes[0],
    });

    expect(response.status).toBe(200);
  });

  it("holds the code and attempt budgets across client addresses", async () => {
    const fixture = createFixture({ hasPasskey: false });

    for (let code = 0; code < 6; code++) {
      await fixture.post("/email-otp/send-verification-otp", {
        email: ownerEmail,
        type: "sign-in",
      });
      const otp = fixture.issuedCodes.at(-1) ?? "";
      for (let guess = 0; guess < 2; guess++) {
        await fixture.post("/sign-in/email-otp", {
          email: ownerEmail,
          otp: wrongCode(otp),
        });
      }
    }
    expect(fixture.issuedCodes).toHaveLength(5);

    const response = await fixture.post("/sign-in/email-otp", {
      email: ownerEmail,
      otp: fixture.issuedCodes.at(-1),
    });
    expect(response.status).toBe(400);
    expect(fixture.db.session).toHaveLength(0);
  });
});
