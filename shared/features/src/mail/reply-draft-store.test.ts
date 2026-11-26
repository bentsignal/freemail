import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReplyDraftRemote, SavedReplyDraft } from "./reply-draft-store";
import { createReplyDraftStore } from "./reply-draft-store";

function draft(body: string) {
  return {
    attachments: [],
    bcc: "",
    body,
    cc: "",
    subject: "Re: Plans",
    to: "maya@example.com",
  };
}

function setup() {
  let saved: string | undefined;
  let clock = 1000;
  const serverDrafts = new Map<string, SavedReplyDraft>();
  const remote = {
    remove: vi.fn(
      ({ deletedAt, threadId }: { deletedAt: number; threadId: string }) => {
        const existing = serverDrafts.get(threadId);
        if (existing && existing.updatedAt <= deletedAt) {
          serverDrafts.delete(threadId);
        }
        return Promise.resolve();
      },
    ),
    save: vi.fn((next: SavedReplyDraft) => {
      const existing = serverDrafts.get(next.threadId);
      if (existing && existing.updatedAt >= next.updatedAt) {
        return Promise.resolve({ updatedAt: existing.updatedAt });
      }
      serverDrafts.set(next.threadId, next);
      return Promise.resolve({ updatedAt: next.updatedAt });
    }),
  } satisfies ReplyDraftRemote;
  const store = createReplyDraftStore({
    now: () => clock,
    storage: {
      read: () => saved,
      write: (text) => {
        saved = text;
      },
    },
  });
  return {
    remote,
    serverDrafts,
    setClock: (value: number) => {
      clock = value;
    },
    store,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reply draft store", () => {
  it("sends an edit a second after typing pauses", async () => {
    const { remote, serverDrafts, store } = setup();
    store.connect(remote);
    store.save("thread-1", draft("Sounds"), "account-1");
    store.save("thread-1", draft("Sounds good"), "account-1");
    await vi.advanceTimersByTimeAsync(999);
    expect(remote.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(remote.save).toHaveBeenCalledTimes(1);
    expect(serverDrafts.get("thread-1")).toMatchObject({
      accountId: "account-1",
      body: "Sounds good",
    });
    expect(store.get("thread-1")?.syncedAt).toBe(
      store.get("thread-1")?.updatedAt,
    );
  });

  it("keeps edits made while offline and sends them once connected", async () => {
    const { remote, serverDrafts, store } = setup();
    store.save("thread-1", draft("Written on the train"), undefined);
    await vi.advanceTimersByTimeAsync(5000);
    expect(remote.save).not.toHaveBeenCalled();
    store.connect(remote);
    await vi.advanceTimersByTimeAsync(0);
    expect(serverDrafts.get("thread-1")?.body).toBe("Written on the train");
  });

  it("retries a failed send", async () => {
    const { remote, serverDrafts, store } = setup();
    remote.save.mockRejectedValueOnce(new Error("offline"));
    store.connect(remote);
    store.save("thread-1", draft("Hello"), undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(serverDrafts.size).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(serverDrafts.get("thread-1")?.body).toBe("Hello");
  });

  it("deletes the server's copy too", async () => {
    const { remote, serverDrafts, setClock, store } = setup();
    store.connect(remote);
    store.save("thread-1", draft("Hello"), undefined);
    await vi.advanceTimersByTimeAsync(1000);
    setClock(2000);
    store.remove("thread-1");
    expect(store.get("thread-1")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(serverDrafts.size).toBe(0);
    expect(remote.remove).toHaveBeenCalledWith({
      deletedAt: 2000,
      threadId: "thread-1",
    });
  });

  it("takes another device's edit and tells an open composer", () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.applyServer([
      {
        attachments: [],
        bcc: "",
        body: "From the laptop",
        cc: "",
        subject: "Re: Plans",
        threadId: "thread-1",
        to: "maya@example.com",
        updatedAt: 5000,
      },
    ]);
    expect(store.get("thread-1")?.body).toBe("From the laptop");
    expect(store.getEditVersion("thread-1")).toBe(1);
    expect(listener).toHaveBeenCalled();
  });

  it("removes a draft when its text is cleared", () => {
    const { store } = setup();
    store.save("thread-1", draft("Hello"), undefined);
    store.save("thread-1", draft(""), undefined);
    expect(store.get("thread-1")).toBeUndefined();
  });
});
