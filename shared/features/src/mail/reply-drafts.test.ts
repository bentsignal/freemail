import { describe, expect, it } from "vitest";

import type { ReplyDraft, ServerReplyDraft } from "./reply-drafts";
import type { ComposerAttachment, ComposerDraft } from "./types";
import {
  createEmptyReplyDraftState,
  isReplyDraftWorthKeeping,
  mergeServerReplyDrafts,
  parseReplyDraftState,
  serializeReplyDraftState,
  toComposerDraft,
  toReplyDraft,
} from "./reply-drafts";

function attachment(
  id: string,
  status: ComposerAttachment["status"] = "ready",
) {
  return {
    contentType: "image/png",
    draftAttachmentId: `draft-${id}`,
    fileName: `${id}.png`,
    id,
    size: 10,
    status,
  } satisfies ComposerAttachment;
}

function draft(overrides: Partial<ComposerDraft> = {}) {
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

function local(body: string, updatedAt: number, syncedAt?: number) {
  return {
    ...draft({ body }),
    syncedAt,
    updatedAt,
  } satisfies ReplyDraft;
}

function server(threadId: string, body: string, updatedAt: number) {
  return {
    ...draft({ body }),
    attachments: [],
    threadId,
    updatedAt,
  } satisfies ServerReplyDraft;
}

describe("reply drafts", () => {
  it("keeps a reply only once something is written in it", () => {
    expect(isReplyDraftWorthKeeping(draft())).toBe(false);
    expect(isReplyDraftWorthKeeping(draft({ body: "  " }))).toBe(false);
    expect(isReplyDraftWorthKeeping(draft({ body: "Sounds good" }))).toBe(true);
    expect(isReplyDraftWorthKeeping(draft({ cc: "sam@example.com" }))).toBe(
      true,
    );
    expect(
      isReplyDraftWorthKeeping(
        draft({ attachments: [attachment("a", "uploading")] }),
      ),
    ).toBe(false);
    expect(
      isReplyDraftWorthKeeping(draft({ attachments: [attachment("a")] })),
    ).toBe(true);
  });

  it("restores what was written, keeping only finished uploads", () => {
    const saved = toReplyDraft({
      accountId: "account-1",
      draft: draft({
        attachments: [attachment("a"), attachment("b", "uploading")],
        body: "See attached",
      }),
      now: 1000,
      previous: undefined,
    });
    expect(saved.accountId).toBe("account-1");
    expect(toComposerDraft(saved)).toEqual(
      draft({ attachments: [attachment("a")], body: "See attached" }),
    );
  });

  it("makes each edit newer than the last, whatever the clock says", () => {
    const previous = local("From the laptop", 5000, 5000);
    const next = toReplyDraft({
      accountId: undefined,
      draft: draft({ body: "From the phone" }),
      now: 4000,
      previous,
    });
    expect(next.updatedAt).toBe(5001);
    expect(next.syncedAt).toBe(5000);
  });
});

describe("merging the server's reply drafts", () => {
  it("takes another device's newer edit and keeps its own newer one", () => {
    const { edited, state } = mergeServerReplyDrafts(
      {
        deleted: {},
        drafts: {
          mine: local("mine, newer", 20, 10),
          theirs: local("theirs, older", 10, 10),
        },
      },
      [
        server("mine", "mine, older", 10),
        server("theirs", "theirs, newer", 20),
      ],
    );
    expect(state.drafts.mine?.body).toBe("mine, newer");
    expect(state.drafts.theirs).toMatchObject({
      body: "theirs, newer",
      syncedAt: 20,
      updatedAt: 20,
    });
    expect(edited).toEqual(["theirs"]);
  });

  it("marks an edit synced once the server has it", () => {
    const { edited, state } = mergeServerReplyDrafts(
      { deleted: {}, drafts: { a: local("hello", 10) } },
      [server("a", "hello", 10)],
    );
    expect(state.drafts.a?.syncedAt).toBe(10);
    expect(edited).toEqual([]);
  });

  it("drops a draft sent or deleted elsewhere, unless it has unsent edits", () => {
    const { state } = mergeServerReplyDrafts(
      {
        deleted: {},
        drafts: {
          sent: local("sent elsewhere", 10, 10),
          edited: local("edited since", 20, 10),
          fresh: local("never synced", 30),
        },
      },
      [],
    );
    expect(Object.keys(state.drafts).sort()).toEqual(["edited", "fresh"]);
  });

  it("keeps a deletion until the server has it, unless edited elsewhere after", () => {
    const { state } = mergeServerReplyDrafts(
      { deleted: { a: 15, b: 15, c: 15 }, drafts: {} },
      [server("a", "deleted here", 10), server("b", "edited after", 20)],
    );
    expect(state.deleted).toEqual({ a: 15 });
    expect(Object.keys(state.drafts)).toEqual(["b"]);
  });

  it("reads back what it wrote and ignores anything else", () => {
    const state = {
      deleted: { b: 3 },
      drafts: { a: local("Sounds good", 1000, 1000) },
    };
    expect(parseReplyDraftState(serializeReplyDraftState(state))).toEqual(
      state,
    );
    expect(
      parseReplyDraftState(JSON.stringify({ drafts: {}, version: 1 })),
    ).toEqual(createEmptyReplyDraftState());
    expect(
      parseReplyDraftState(
        JSON.stringify({ deleted: {}, drafts: { a: { body: 1 } }, version: 2 }),
      ),
    ).toEqual(createEmptyReplyDraftState());
  });
});
