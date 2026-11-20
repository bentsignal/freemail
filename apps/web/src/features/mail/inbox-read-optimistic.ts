import type { OptimisticLocalStore } from "convex/browser";
import type { DefaultFunctionArgs, FunctionReference } from "convex/server";

import type { Id } from "@freemail/convex/model";
import { api } from "@freemail/convex/api";

interface MarkInboxReadArgs {
  accountId?: Id<"mailAccounts">;
}

interface ReadableRow {
  accountId: string;
  classification?: { isSpam?: boolean } | null;
  inInbox: boolean;
  isRead: boolean;
  threadId: Id<"threads">;
}

type QueryRef<Args extends DefaultFunctionArgs, Value> = FunctionReference<
  "query",
  "public",
  Args,
  Value
>;

export function optimisticallyMarkInboxRead(
  store: OptimisticLocalStore,
  { accountId }: MarkInboxReadArgs,
) {
  const markedThreadIds = new Set<Id<"threads">>();
  function mark<Row extends ReadableRow>(row: Row) {
    if (!isMarkedByInboxRead(row, accountId)) return row;
    markedThreadIds.add(row.threadId);
    return { ...row, isRead: true };
  }
  markPages(store, api.mail.queries.listInbox, mark);
  markPages(store, api.mail.queries.listPinned, mark);
  markPages(store, api.mail.queries.listAllMail, mark);
  markPages(store, api.mail.queries.searchHeaders, mark);
  for (const query of store.getAllQueries(api.mail.queries.getMessagesByIds)) {
    if (!query.value) continue;
    store.setQuery(
      api.mail.queries.getMessagesByIds,
      query.args,
      query.value.map(mark),
    );
  }
  for (const threadId of markedThreadIds) {
    markThreadQuery(store, threadId);
  }
  const counts = store.getQuery(api.mail.queries.getUnreadCounts, {});
  if (counts) {
    store.setQuery(
      api.mail.queries.getUnreadCounts,
      {},
      getUnreadCountsAfterInboxRead(counts, accountId),
    );
  }
}

export function isMarkedByInboxRead(
  row: ReadableRow,
  accountId: string | undefined,
) {
  return (
    !row.isRead &&
    row.inInbox &&
    row.classification?.isSpam !== true &&
    (accountId === undefined || row.accountId === accountId)
  );
}

export function getUnreadCountsAfterInboxRead(
  current: { all: number; byAccount: Record<string, number> },
  accountId: string | undefined,
) {
  if (accountId === undefined) return { all: 0, byAccount: {} };
  const { [accountId]: marked = 0, ...byAccount } = current.byAccount;
  return { all: Math.max(0, current.all - marked), byAccount };
}

function markPages<Args extends DefaultFunctionArgs, Row extends ReadableRow>(
  store: OptimisticLocalStore,
  query: QueryRef<Args, { page: Row[] }>,
  mark: (row: Row) => Row,
) {
  for (const { args, value } of store.getAllQueries(query)) {
    if (!value) continue;
    store.setQuery(query, args, { ...value, page: value.page.map(mark) });
  }
}

function markThreadQuery(store: OptimisticLocalStore, threadId: Id<"threads">) {
  const current = store.getQuery(api.mail.queries.getThread, { threadId });
  if (!current) return;
  store.setQuery(
    api.mail.queries.getThread,
    { threadId },
    {
      ...current,
      messages: current.messages.map((message) => ({
        ...message,
        isRead: true,
      })),
      unreadCount: 0,
    },
  );
}
