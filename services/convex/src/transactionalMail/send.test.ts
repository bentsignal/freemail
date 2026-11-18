import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransactionalMailDeps, TransactionalMailMessage } from "./send";
import {
  constantTimeEqual,
  findClient,
  handleTransactionalSend,
  isAllowedRecipient,
  MAX_SUBJECT_LENGTH,
  MAX_TEXT_LENGTH,
  parseClients,
  parseSendRequest,
  sha256Hex,
} from "./send";

const TOKEN = "notes-test-token-0123456789abcdef";
const OTHER_TOKEN = "other-test-token-0123456789abcdef";

async function clientsConfig() {
  return JSON.stringify([
    {
      name: "notes",
      tokenSha256: await sha256Hex(TOKEN),
      from: "notes@example.com",
      fromName: "Notes",
      to: ["owner@example.com"],
    },
    {
      name: "other",
      tokenSha256: (await sha256Hex(OTHER_TOKEN)).toUpperCase(),
      from: "other@example.com",
      fromName: "Other App",
      to: ["someone@example.com"],
    },
  ]);
}

const validBody = {
  to: "owner@example.com",
  subject: "Your Notes sign-in code",
  text: "Your Notes sign-in code is 123456. It expires in 5 minutes.",
};

function sendRequest(
  body: unknown,
  {
    token = TOKEN,
    contentType = "application/json",
  }: { token?: string | null; contentType?: string } = {},
) {
  const headers = new Headers({ "Content-Type": contentType });
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://example.convex.site/transactional-mail/send", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let sent: TransactionalMailMessage[];
let deps: TransactionalMailDeps;

beforeEach(async () => {
  sent = [];
  deps = {
    clientsConfig: await clientsConfig(),
    consumeRateLimit: vi.fn(() => Promise.resolve(true)),
    send: vi.fn((message: TransactionalMailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transactional mail endpoint", () => {
  it("sends from the client's configured sender and answers 202", async () => {
    const response = await handleTransactionalSend(
      sendRequest({ ...validBody, to: "Owner@Example.com" }),
      deps,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toEqual([
      {
        from: '"Notes" <notes@example.com>',
        to: "Owner@Example.com",
        subject: validBody.subject,
        text: validBody.text,
      },
    ]);
    expect(deps.consumeRateLimit).toHaveBeenCalledWith("notes");
  });

  it.each([
    ["no Authorization header", null],
    ["an unknown token", "not-a-real-token"],
    ["an empty token", ""],
  ])("answers 401 for %s", async (_label, token) => {
    const response = await handleTransactionalSend(
      sendRequest(validBody, { token }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(sent).toEqual([]);
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("answers 401 for a non-Bearer scheme", async () => {
    const request = sendRequest(validBody, { token: null });
    request.headers.set("Authorization", `Basic ${TOKEN}`);
    expect((await handleTransactionalSend(request, deps)).status).toBe(401);
  });

  it("answers 401 to everyone when no clients are configured", async () => {
    const response = await handleTransactionalSend(sendRequest(validBody), {
      ...deps,
      clientsConfig: undefined,
    });
    expect(response.status).toBe(401);
  });

  it("answers 500 without sending when the client config is broken", async () => {
    const response = await handleTransactionalSend(sendRequest(validBody), {
      ...deps,
      clientsConfig: "[{",
    });
    expect(response.status).toBe(500);
    expect(sent).toEqual([]);
  });

  it("answers 403 for a recipient outside the client's allowlist", async () => {
    const response = await handleTransactionalSend(
      sendRequest({ ...validBody, to: "someone@example.com" }),
      deps,
    );
    expect(response.status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("keeps each client to its own allowlist and sender", async () => {
    const response = await handleTransactionalSend(
      sendRequest(
        { ...validBody, to: "someone@example.com" },
        { token: OTHER_TOKEN },
      ),
      deps,
    );
    expect(response.status).toBe(202);
    expect(sent[0]?.from).toBe('"Other App" <other@example.com>');
  });
});

describe("transactional mail request checks", () => {
  it.each([
    ["a caller-chosen sender", { ...validBody, from: "evil@example.com" }],
    ["an HTML body", { ...validBody, html: "<b>hi</b>" }],
    ["a missing recipient", { subject: "Hi", text: "Hi" }],
    ["several recipients", { ...validBody, to: ["owner@example.com"] }],
    ["an invalid address", { ...validBody, to: "owner" }],
    ["an empty subject", { ...validBody, subject: "" }],
    ["a subject with a line break", { ...validBody, subject: "Hi\r\nBcc: x" }],
    [
      "a subject that is too long",
      { ...validBody, subject: "a".repeat(MAX_SUBJECT_LENGTH + 1) },
    ],
    ["an empty body", { ...validBody, text: "" }],
    [
      "a body that is too long",
      { ...validBody, text: "a".repeat(MAX_TEXT_LENGTH + 1) },
    ],
    ["malformed JSON", "{not json"],
    ["a JSON array", [validBody]],
  ])("answers 400 for %s", async (_label, body) => {
    const response = await handleTransactionalSend(sendRequest(body), deps);
    expect(response.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("answers 400 for a non-JSON content type", async () => {
    const response = await handleTransactionalSend(
      sendRequest(validBody, { contentType: "text/plain" }),
      deps,
    );
    expect(response.status).toBe(400);
  });

  it("accepts a subject and body at their length limits", async () => {
    const response = await handleTransactionalSend(
      sendRequest({
        ...validBody,
        subject: "a".repeat(MAX_SUBJECT_LENGTH),
        text: "a".repeat(MAX_TEXT_LENGTH),
      }),
      deps,
    );
    expect(response.status).toBe(202);
  });

  it("answers 429 when the client is rate limited", async () => {
    const response = await handleTransactionalSend(sendRequest(validBody), {
      ...deps,
      consumeRateLimit: () => Promise.resolve(false),
    });
    expect(response.status).toBe(429);
    expect(sent).toEqual([]);
  });

  it("answers 502 when SES fails, without logging the message", async () => {
    const response = await handleTransactionalSend(sendRequest(validBody), {
      ...deps,
      send: () => Promise.reject(new Error("SES rejected the message (400)")),
    });
    expect(response.status).toBe(502);

    const logged = JSON.stringify([
      vi.mocked(console.log).mock.calls,
      vi.mocked(console.warn).mock.calls,
      vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain("123456");
    expect(logged).not.toContain(validBody.subject);
    expect(logged).not.toContain("owner@example.com");
  });
});

describe("transactional mail clients", () => {
  it("parses the Notes client entry", () => {
    const clients = parseClients(
      JSON.stringify([
        {
          name: "notes",
          tokenSha256:
            "6ca52bc1e3dd34cb3dfdc1902f8292ba80e37eccc414fd89843458e4d603bbaf",
          from: "notes@rodgers.dev",
          fromName: "Notes",
          to: ["shawn@rodgers.dev"],
        },
      ]),
    );
    expect(clients.map((client) => client.name)).toEqual(["notes"]);
    expect(
      clients.map((client) => [
        isAllowedRecipient(client, "shawn@rodgers.dev"),
        isAllowedRecipient(client, "SHAWN@rodgers.dev"),
        isAllowedRecipient(client, "other@rodgers.dev"),
      ]),
    ).toEqual([[true, true, false]]);
  });

  it.each([
    ["a non-array", "{}"],
    [
      "a short hash",
      '[{"name":"a","tokenSha256":"abc","from":"a@b.co","fromName":"A","to":["a@b.co"]}]',
    ],
    [
      "an empty allowlist",
      `[{"name":"a","tokenSha256":"${"a".repeat(64)}","from":"a@b.co","fromName":"A","to":[]}]`,
    ],
    [
      "a quoted sender name",
      `[{"name":"a","tokenSha256":"${"a".repeat(64)}","from":"a@b.co","fromName":"A\\" <x@y.co>","to":["a@b.co"]}]`,
    ],
    [
      "an extra field",
      `[{"name":"a","tokenSha256":"${"a".repeat(64)}","from":"a@b.co","fromName":"A","to":["a@b.co"],"token":"x"}]`,
    ],
  ])("rejects %s", (_label, config) => {
    expect(() => parseClients(config)).toThrow("TRANSACTIONAL_MAIL_CLIENTS");
  });

  it("rejects duplicate client names", () => {
    const entry = {
      name: "a",
      tokenSha256: "a".repeat(64),
      from: "a@b.co",
      fromName: "A",
      to: ["a@b.co"],
    };
    expect(() => parseClients(JSON.stringify([entry, entry]))).toThrow(
      "duplicate",
    );
  });

  it("finds a client only by the SHA-256 of its token", async () => {
    const clients = parseClients(await clientsConfig());
    expect((await findClient(clients, `Bearer ${TOKEN}`))?.name).toBe("notes");
    expect((await findClient(clients, `Bearer ${OTHER_TOKEN}`))?.name).toBe(
      "other",
    );
    expect(
      await findClient(clients, `Bearer ${await sha256Hex(TOKEN)}`),
    ).toBeUndefined();
  });

  it("hashes to lowercase hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("compares strings of any length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("ab", "abc")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
  });

  it("trims the recipient before checking it", () => {
    expect(
      parseSendRequest({ ...validBody, to: " owner@example.com " }),
    ).toEqual(validBody);
  });
});
