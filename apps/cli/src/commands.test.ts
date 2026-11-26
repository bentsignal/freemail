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

  it("parses read-only token commands", () => {
    expect(parseCommand(["tokens", "create", "--out", "vera-token"])).toEqual({
      days: 90,
      kind: "tokens-create",
      label: "Read-only mail reader",
      out: "vera-token",
    });
    expect(
      parseCommand([
        "tokens",
        "create",
        "--out",
        "t",
        "--label",
        "Vera on GamerBox",
        "--days",
        "30",
      ]),
    ).toMatchObject({ days: 30, label: "Vera on GamerBox" });
    expect(parseCommand(["tokens", "revoke", "abc"])).toEqual({
      credentialId: "abc",
      kind: "tokens-revoke",
    });
    expect(() => parseCommand(["tokens", "create"])).toThrow("--out");
    expect(() =>
      parseCommand(["tokens", "create", "--out", "t", "--days", "91"]),
    ).toThrow("between 1 and 90");
  });
});
