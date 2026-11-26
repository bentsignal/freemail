import { describe, expect, it } from "vitest";

import { parseCommand } from "./commands.ts";

describe("CLI command parsing", () => {
  it("discovers help without arguments", () => {
    expect(parseCommand([])).toEqual({ kind: "help" });
    expect(parseCommand(["mail", "help"])).toEqual({
      kind: "help",
      topic: "mail",
    });
  });

  it("parses agent-friendly mail commands", () => {
    expect(parseCommand(["mail", "get", "thread123"])).toEqual({
      kind: "mail-get",
      threadId: "thread123",
    });
    expect(
      parseCommand([
        "mail",
        "search",
        "flight",
        "receipt",
        "--limit",
        "4",
        "--account",
        "account123",
      ]),
    ).toEqual({
      accountId: "account123",
      kind: "mail-search",
      limit: 4,
      query: "flight receipt",
    });
  });

  it("rejects invalid commands and limits", () => {
    expect(() => parseCommand(["mail", "search"])).toThrow("requires a query");
    expect(() => parseCommand(["mail", "list", "--limit", "50"])).toThrow(
      "between 1 and 25",
    );
  });
});

describe("CLI mail write commands", () => {
  it("parses mail send", () => {
    expect(
      parseCommand([
        "mail",
        "send",
        "--from",
        "me@example.dev",
        "--to",
        "a@example.com, b@example.com",
        "--to",
        "c@example.com",
        "--cc",
        "d@example.com",
        "--subject",
        "Hi",
        "--body",
        "-- signed, me",
      ]),
    ).toEqual({
      bcc: [],
      body: "-- signed, me",
      cc: ["d@example.com"],
      from: "me@example.dev",
      kind: "mail-send",
      subject: "Hi",
      to: ["a@example.com", "b@example.com", "c@example.com"],
      wait: true,
    });
    expect(
      parseCommand([
        "mail",
        "send",
        "--from",
        "me@example.dev",
        "--to",
        "a@example.com",
        "--subject",
        "",
        "--body-file",
        "-",
        "--idempotency-key",
        "retry-key-1",
        "--no-wait",
      ]),
    ).toMatchObject({
      bodyFile: "-",
      idempotencyKey: "retry-key-1",
      subject: "",
      wait: false,
    });
  });

  it("rejects incomplete sends", () => {
    const base = ["mail", "send", "--from", "me@example.dev"];
    expect(() => parseCommand([...base, "--subject", "Hi"])).toThrow(
      "requires --to",
    );
    expect(() =>
      parseCommand([...base, "--to", "a@example.com", "--body", "x"]),
    ).toThrow("requires --subject");
    expect(() =>
      parseCommand([...base, "--to", "a@example.com", "--subject", "Hi"]),
    ).toThrow("exactly one of --body or --body-file");
    expect(() =>
      parseCommand(["mail", "send", "--to", "a@example.com"]),
    ).toThrow("requires --from");
  });

  it("parses delete and mark-read", () => {
    expect(parseCommand(["mail", "delete", "thread123"])).toEqual({
      id: "thread123",
      kind: "mail-delete",
    });
    expect(parseCommand(["mail", "mark-read", "thread123"])).toEqual({
      id: "thread123",
      kind: "mail-mark-read",
    });
    expect(() => parseCommand(["mail", "delete"])).toThrow(
      "requires a thread or message ID",
    );
  });
});
