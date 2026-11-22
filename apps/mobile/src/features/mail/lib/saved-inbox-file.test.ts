import { describe, expect, it } from "vitest";

import { parseSavedInbox, SAVED_INBOX_VERSION } from "./saved-inbox-file";

describe("saved inbox file", () => {
  it("reads what was saved", () => {
    const saved = { accounts: [], threads: [], version: SAVED_INBOX_VERSION };
    expect(parseSavedInbox(JSON.stringify(saved))).toEqual({
      accounts: [],
      threads: [],
    });
  });

  it("ignores a file from another version or of another shape", () => {
    expect(
      parseSavedInbox(
        JSON.stringify({ accounts: [], threads: [], version: 0 }),
      ),
    ).toBeUndefined();
    expect(
      parseSavedInbox(JSON.stringify({ version: SAVED_INBOX_VERSION })),
    ).toBeUndefined();
    expect(parseSavedInbox("null")).toBeUndefined();
  });
});
