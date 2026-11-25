import { describe, expect, it } from "vitest";

import type { NativeComposerAttachment } from "../screens/use-native-attachments";
import {
  ATTACHMENT_KEEP_MS,
  isWorthKeeping,
  parseReplyDrafts,
  serializeReplyDrafts,
  toComposerDraft,
  toReplyDraft,
} from "./reply-drafts-file";

function attachment(
  id: string,
  status: NativeComposerAttachment["status"] = "ready",
) {
  return {
    contentType: "image/png",
    draftAttachmentId: `draft-${id}`,
    fileName: `${id}.png`,
    id,
    size: 10,
    status,
    uri: `file:///${id}.png`,
  } satisfies NativeComposerAttachment;
}

function draft(overrides: Partial<Parameters<typeof isWorthKeeping>[0]> = {}) {
  return {
    attachments: [],
    bcc: "",
    body: "",
    cc: "",
    subject: "Re: Plans",
    to: "maya@example.com",
    ...overrides,
  };
}

describe("reply drafts", () => {
  it("keeps a reply only once something is written in it", () => {
    expect(isWorthKeeping(draft())).toBe(false);
    expect(isWorthKeeping(draft({ body: "  " }))).toBe(false);
    expect(isWorthKeeping(draft({ body: "Sounds good" }))).toBe(true);
    expect(isWorthKeeping(draft({ cc: "sam@example.com" }))).toBe(true);
    expect(
      isWorthKeeping(draft({ attachments: [attachment("a", "uploading")] })),
    ).toBe(false);
    expect(isWorthKeeping(draft({ attachments: [attachment("a")] }))).toBe(
      true,
    );
  });

  it("restores what was written, with its sender", () => {
    const saved = toReplyDraft({
      accountId: "account-1",
      draft: draft({ body: "Sounds good", cc: "sam@example.com" }),
      now: 1000,
      previous: undefined,
    });
    expect(saved.accountId).toBe("account-1");
    expect(toComposerDraft(saved, 2000)).toEqual(
      draft({ body: "Sounds good", cc: "sam@example.com" }),
    );
  });

  it("keeps only finished uploads", () => {
    const saved = toReplyDraft({
      accountId: undefined,
      draft: draft({
        attachments: [attachment("a"), attachment("b", "uploading")],
        body: "See attached",
      }),
      now: 1000,
      previous: undefined,
    });
    expect(toComposerDraft(saved, 1000).attachments).toEqual([attachment("a")]);
  });

  it("drops an attachment before the server deletes its upload", () => {
    const first = toReplyDraft({
      accountId: undefined,
      draft: draft({ attachments: [attachment("a")], body: "See attached" }),
      now: 0,
      previous: undefined,
    });
    const later = toReplyDraft({
      accountId: undefined,
      draft: draft({
        attachments: [attachment("a"), attachment("b")],
        body: "See attached, both",
      }),
      now: ATTACHMENT_KEEP_MS - 1,
      previous: first,
    });
    expect(
      toComposerDraft(later, ATTACHMENT_KEEP_MS).attachments.map(
        (item) => item.id,
      ),
    ).toEqual(["b"]);
  });

  it("reads back what it wrote and ignores anything else", () => {
    const saved = toReplyDraft({
      accountId: "account-1",
      draft: draft({ body: "Sounds good" }),
      now: 1000,
      previous: undefined,
    });
    expect(
      parseReplyDrafts(serializeReplyDrafts({ "thread-1": saved })),
    ).toEqual({ "thread-1": saved });
    expect(
      parseReplyDrafts(JSON.stringify({ drafts: {}, version: 0 })),
    ).toEqual({});
    expect(
      parseReplyDrafts(
        JSON.stringify({ drafts: { "thread-1": { body: 1 } }, version: 1 }),
      ),
    ).toEqual({});
  });
});
