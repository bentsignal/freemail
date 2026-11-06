import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendRecoveryEmail, sendRegistrationEmail } from "./registrationEmail";

vi.mock("./providers/hosted/env", () => ({
  requireSesConfig: () => ({
    region: "us-east-1",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret",
    configurationSet: "freemail",
  }),
  requireHostedMailConfig: () => {
    throw new Error("auth emails must not need the mail bucket");
  },
}));

const fetchMock = vi.fn((_input: string | URL | Request, _init?: RequestInit) =>
  Promise.resolve(Response.json({ MessageId: "ses-1" })),
);

function sentRequest() {
  const [input, init] = fetchMock.mock.calls[0] ?? [];
  if (!input) throw new Error("nothing was sent");
  return new Request(input, init);
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth code emails", () => {
  it("sends the registration code through Amazon SES", async () => {
    await sendRegistrationEmail({
      from: "Freemail <mail@example.com>",
      otp: "123456",
      to: "person@example.com",
    });

    const request = sentRequest();
    expect(request.url).toBe(
      "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/ses\//u,
    );
    expect(await request.json()).toEqual({
      FromEmailAddress: "Freemail <mail@example.com>",
      Destination: { ToAddresses: ["person@example.com"] },
      Content: {
        Simple: {
          Subject: {
            Data: "Your Freemail verification code",
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Data: "Your Freemail verification code is 123456. It expires in 5 minutes.",
              Charset: "UTF-8",
            },
          },
        },
      },
      ConfigurationSetName: "freemail",
    });
  });

  it("labels sign-in codes and explains unsolicited requests", async () => {
    await sendRecoveryEmail({
      from: "Freemail <mail@example.com>",
      otp: "654321",
      to: "person@example.com",
    });

    expect(await sentRequest().json()).toMatchObject({
      Content: {
        Simple: {
          Subject: { Data: "Your Freemail sign-in code" },
          Body: {
            Text: {
              Data: "Your Freemail sign-in code is 654321. It expires in 5 minutes. If you did not request this, you can ignore this email.",
            },
          },
        },
      },
    });
  });

  it("fails when SES rejects the email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { message: "Email address is not verified." },
            { status: 400 },
          ),
        ),
      ),
    );

    await expect(
      sendRegistrationEmail({
        from: "Freemail <mail@example.com>",
        otp: "123456",
        to: "person@example.com",
      }),
    ).rejects.toThrow(
      "SES rejected the message (400): Email address is not verified.",
    );
  });
});
