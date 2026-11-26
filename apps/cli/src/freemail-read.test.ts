import { describe, expect, it, vi } from "vitest";

import {
  callTool,
  parseReadCommand,
  parseToken,
  tokenFilePath,
  toolRequest,
} from "./freemail-read.ts";

const token = `rodge_agent_${"a".repeat(43)}`;

describe("freemail-read", () => {
  it("maps each command to a read-only tool", () => {
    expect(toolRequest(parseReadCommand(["unread", "--limit", "5"]))).toEqual({
      arguments: { limit: 5 },
      tool: "list_unread",
    });
    expect(toolRequest(parseReadCommand(["thread", "t1"]))).toEqual({
      arguments: { threadId: "t1" },
      tool: "get_thread",
    });
    expect(
      toolRequest(parseReadCommand(["search", "flight", "receipt"])),
    ).toEqual({
      arguments: { query: "flight receipt" },
      tool: "search_mail",
    });
    expect(toolRequest(parseReadCommand(["status"]))).toEqual({
      arguments: {},
      tool: "list_accounts",
    });
  });

  it("has no command that changes mail", () => {
    for (const command of ["send", "archive", "delete", "mark-read", "read"]) {
      expect(() => parseReadCommand([command])).toThrow("Unknown command");
    }
    expect(() => parseReadCommand(["unread", "--limit", "51"])).toThrow(
      "between 1 and 50",
    );
  });

  it("keeps the token in a per-user file", () => {
    expect(
      tokenFilePath({ APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, "win32"),
    ).toContain("Freemail");
    expect(tokenFilePath({ XDG_CONFIG_HOME: "/cfg" }, "linux")).toBe(
      "/cfg/freemail/agent-token",
    );
    expect(tokenFilePath({ FREEMAIL_TOKEN_FILE: "/x/token" }, "win32")).toBe(
      "/x/token",
    );
  });

  it("accepts only agent tokens", () => {
    expect(parseToken(`${token}\r\n`)).toBe(token);
    expect(() => parseToken("__Secure-better-auth.session_token=x")).toThrow();
  });

  it("sends the token only as a bearer header and reports error codes", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          { error: { code: "INSUFFICIENT_SCOPE" } },
          { status: 403 },
        ),
      ),
    );
    await expect(
      callTool(
        { arguments: {}, tool: "list_unread" },
        token,
        "https://x.test",
        fetchImpl,
      ),
    ).rejects.toThrow("INSUFFICIENT_SCOPE (403)");
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    expect(typeof init?.body === "string" ? init.body : "").not.toContain(
      token,
    );
  });
});
