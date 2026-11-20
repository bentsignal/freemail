import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConvex,
  createFixture,
  ownerEmail,
  wrongCode,
} from "./emailCodeAuth.fixtures";
import { createEmailCodeLimit } from "./emailCodeLimit";

const recoveryEmails = vi.hoisted(() => new Array<{ otp: string }>());
vi.mock("./registrationEmail", () => ({
  sendRecoveryEmail: (message: { otp: string }) => {
    recoveryEmails.push(message);
    return Promise.resolve();
  },
  sendRegistrationEmail: () => Promise.resolve(),
}));

const recoveryError = "The recovery code is invalid or expired";

beforeEach(() => {
  recoveryEmails.length = 0;
});

describe("passkey recovery codes", () => {
  it("signs in with a correct code", async () => {
    const fixture = createFixture();

    await fixture.post("/passkey-recovery/request", { email: ownerEmail });
    const response = await fixture.post("/passkey-recovery/verify", {
      code: recoveryEmails[0]?.otp,
      email: ownerEmail,
    });

    expect(response).toMatchObject({ body: { success: true }, status: 200 });
    expect(response.setCookie).toContain("better-auth.session_token");
    expect(fixture.db.session).toHaveLength(1);
  });

  it("sends at most five codes whatever the client address", async () => {
    const fixture = createFixture();

    const responses = [];
    for (let request = 0; request < 20; request++) {
      responses.push(
        await fixture.post("/passkey-recovery/request", { email: ownerEmail }),
      );
    }

    expect(recoveryEmails).toHaveLength(5);
    for (const response of responses) {
      expect(response).toMatchObject({ body: { success: true }, status: 200 });
    }
  });

  it("stops checking codes once the attempt budget is spent", async () => {
    const fixture = createFixture();

    for (let code = 0; code < 5; code++) {
      await fixture.post("/passkey-recovery/request", { email: ownerEmail });
      const otp = recoveryEmails.at(-1)?.otp ?? "";
      for (let guess = 0; guess < 2; guess++) {
        const response = await fixture.post("/passkey-recovery/verify", {
          code: wrongCode(otp),
          email: ownerEmail,
        });
        expect(response.body).toMatchObject({ message: recoveryError });
      }
    }

    const response = await fixture.post("/passkey-recovery/verify", {
      code: recoveryEmails.at(-1)?.otp,
      email: ownerEmail,
    });
    expect(response).toMatchObject({
      body: { message: recoveryError },
      status: 400,
    });
    expect(fixture.db.session).toHaveLength(0);
  });

  it("does not spend the attempt budget while no code is pending", async () => {
    const fixture = createFixture();

    for (let attempt = 0; attempt < 30; attempt++) {
      await fixture.post("/passkey-recovery/verify", {
        code: "000000",
        email: ownerEmail,
      });
    }
    await fixture.post("/passkey-recovery/request", { email: ownerEmail });
    const response = await fixture.post("/passkey-recovery/verify", {
      code: recoveryEmails[0]?.otp,
      email: ownerEmail,
    });

    expect(response.status).toBe(200);
  });
});

describe("email code budget", () => {
  it("refuses outside an action", async () => {
    const t = createConvex();
    await expect(
      t.run((ctx) => createEmailCodeLimit(ctx)("verify")),
    ).resolves.toBe(false);
    await expect(
      t.action((ctx) => createEmailCodeLimit(ctx)("verify")),
    ).resolves.toBe(true);
  });
});
