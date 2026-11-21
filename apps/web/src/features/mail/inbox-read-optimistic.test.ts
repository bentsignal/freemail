/* eslint-disable @typescript-eslint/consistent-type-assertions -- The fake store and branded IDs are compile-time-only in this test. */
import type { OptimisticLocalStore } from "convex/browser";
import { getFunctionName } from "convex/server";
import { expect, it } from "vitest";

import type { Id } from "@freemail/convex/model";
import { api } from "@freemail/convex/api";

import { optimisticallyMarkInboxRead } from "./inbox-read-optimistic";

type Ref = Parameters<typeof getFunctionName>[0];

function createStore(queries: Record<string, unknown[]>) {
  const values = new Map(Object.entries(queries));
  const store = {
    getQuery: (query: Ref) => values.get(getFunctionName(query))?.[0],
    getAllQueries: (query: Ref) =>
      (values.get(getFunctionName(query)) ?? []).map((value) => ({
        args: {},
        value,
      })),
    setQuery: (query: Ref, _args: unknown, value: unknown) =>
      values.set(getFunctionName(query), [value]),
  } as unknown as OptimisticLocalStore;
  return { store, read: (query: Ref) => values.get(getFunctionName(query)) };
}

const FIRST = "first" as Id<"mailAccounts">;
const SECOND = "second" as Id<"mailAccounts">;

function row(
  threadId: string,
  accountId: string,
  extra: { inInbox?: boolean; isSpam?: boolean } = {},
) {
  return {
    accountId,
    classification: extra.isSpam ? { isSpam: true } : null,
    inInbox: extra.inInbox ?? true,
    isRead: false,
    threadId: threadId as Id<"threads">,
  };
}

function inboxStore() {
  return createStore({
    [getFunctionName(api.mail.queries.listInbox)]: [
      { isDone: false, page: [row("a", FIRST), row("b", SECOND)] },
    ],
    [getFunctionName(api.mail.queries.searchHeaders)]: [
      {
        isDone: true,
        page: [
          row("archived", FIRST, { inInbox: false }),
          row("spam", FIRST, { isSpam: true }),
        ],
      },
    ],
    [getFunctionName(api.mail.queries.getThread)]: [
      { messages: [{ isRead: false }, { isRead: false }], unreadCount: 2 },
    ],
    [getFunctionName(api.mail.queries.getUnreadCounts)]: [
      { all: 5, byAccount: { [FIRST]: 3, [SECOND]: 2 } },
    ],
  });
}

function readFlags(value: unknown) {
  return (value as { page: { isRead: boolean; threadId: string }[] }).page.map(
    (item) => [item.threadId, item.isRead],
  );
}

it("marks every inbox row read and clears the unread badge", () => {
  const { store, read } = inboxStore();

  optimisticallyMarkInboxRead(store, {});

  expect(readFlags(read(api.mail.queries.listInbox)?.[0])).toEqual([
    ["a", true],
    ["b", true],
  ]);
  expect(readFlags(read(api.mail.queries.searchHeaders)?.[0])).toEqual([
    ["archived", false],
    ["spam", false],
  ]);
  expect(read(api.mail.queries.getThread)?.[0]).toEqual({
    messages: [{ isRead: true }, { isRead: true }],
    unreadCount: 0,
  });
  expect(read(api.mail.queries.getUnreadCounts)?.[0]).toEqual({
    all: 0,
    byAccount: {},
  });
});

it("marks only the chosen account", () => {
  const { store, read } = inboxStore();

  optimisticallyMarkInboxRead(store, { accountId: FIRST });

  expect(readFlags(read(api.mail.queries.listInbox)?.[0])).toEqual([
    ["a", true],
    ["b", false],
  ]);
  expect(read(api.mail.queries.getUnreadCounts)?.[0]).toEqual({
    all: 2,
    byAccount: { [SECOND]: 2 },
  });
});
