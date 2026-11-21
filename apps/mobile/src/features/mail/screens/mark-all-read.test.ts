import { expect, it } from "vitest";

import { getMarkAllReadMessage, getScopedUnreadCount } from "./mark-all-read";

const accounts = [{ address: "work@example.com", id: "work" }];

it("counts the unread conversations in the current scope", () => {
  const counts = { all: 7, byAccount: { work: 3 } };
  expect(getScopedUnreadCount(counts, "all")).toBe(7);
  expect(getScopedUnreadCount(counts, "work")).toBe(3);
  expect(getScopedUnreadCount(counts, "other")).toBe(0);
  expect(getScopedUnreadCount(undefined, "all")).toBe(0);
});

it("names the inbox or the account being marked read", () => {
  expect(getMarkAllReadMessage(1, "all", accounts)).toBe(
    "1 unread conversation in your inbox.",
  );
  expect(getMarkAllReadMessage(3, "work", accounts)).toBe(
    "3 unread conversations in work@example.com.",
  );
});
