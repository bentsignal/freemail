import type { MailAccountFilter } from "@freemail/features/mail";

import type { MobileMailAccount } from "../lib/convex-mail";

export function getScopedUnreadCount(
  counts: { all: number; byAccount: Record<string, number> } | undefined,
  accountFilter: MailAccountFilter,
) {
  if (!counts) return 0;
  if (accountFilter === "all") return counts.all;
  return counts.byAccount[accountFilter] ?? 0;
}

export function getMarkAllReadMessage(
  count: number,
  accountFilter: MailAccountFilter,
  accounts: Pick<MobileMailAccount, "id" | "address">[],
) {
  const conversations = `${count} unread conversation${count === 1 ? "" : "s"}`;
  const account = accounts.find((candidate) => candidate.id === accountFilter);
  if (!account) return `${conversations} in your inbox.`;
  return `${conversations} in ${account.address}.`;
}
