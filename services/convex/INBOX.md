# Thread-level inbox pagination

`mail.queries.listInbox` and `mail.queries.listPinned` paginate `threads`, not
`messages`. The main inbox uses thread indexes ordered by `isPinned` and then
`latestInboxMessageAt`, so every pinned page precedes every unpinned page while
each group remains newest-first. Each returned row keeps the existing enriched
message shape for client compatibility, but its `_id` is selected dynamically
from the newest message that is still in the inbox. `threadId` is the stable
list identity.

The thread projection stores:

- `inInbox`, so removed or archived-only conversations do not consume pages.
- `latestInboxMessageId` and `latestInboxMessageAt`, which select the current
  message route and preserve descending received order.
- `isPinned`, which is true when any inbox message in the thread is pinned.
- `unreadCount`, which remains the source of truth for the row's `isRead` value.

Provider upserts and deletes recalculate this projection. Thread pin, single
message pin, removal, demo seed, and malformed-message repair paths update it as
well. Header search remains message-indexed; clients retain their compatibility
dedupe so lexical and semantic search ordering does not change.

## Existing thread migration

Projection fields are optional in the schema so deployment is safe before
existing rows are migrated. Queries treat a missing `inInbox` or `isPinned`
field as a legacy candidate and verify its representative message at read time.
This prevents disappearing mail during rollout, though legacy removed or
unpinned threads can make pages sparse until backfill completes.

Run the internal mutation in bounded pages and pass each returned cursor into
the next call until `isDone` is true:

```sh
pnpm --filter @freemail/convex exec convex run mail/maintenance:backfillThreadInboxProjection '{"paginationOpts":{"cursor":null,"numItems":100}}'
```

The backfill is idempotent and recomputes projection state from messages.
Zero-message orphan threads are explicitly marked outside the inbox so they do
not consume pagination cursor slots before row enrichment.

## Unread counts

`mail.queries.getUnreadCounts` reads one `inboxUnreadCounts` document per
owner (each account's count) and the owner's accounts, so it costs the same
however much mail is unread. A thread counts when the inbox shows it as
unread: unread mail, a message in the inbox, and that message not spam
(`countsAsUnreadInboxThread` in `inboxUnread.ts`). Each counted thread has an
`inboxUnreadThreads` row, and the count changes in the same transaction as the
row, so the two can't drift apart.

Table triggers keep them current: every mutation is built with
`internalMutation` from `functions.ts` or `authedMutation` from `utils.ts`,
which run `inboxUnread.ts`'s triggers on each write to `threads` and to
`messageClassifications` (when `isSpam` changes). Lint rejects the raw
builders. A write that skips them (`npx convex import`, the dashboard, a test's
`t.run`) leaves the counters behind until
`mail/inboxUnreadBackfill:backfill` runs again; it recounts every unread
thread, drops rows for threads that no longer count, and is safe to repeat.

Until the backfill has finished for an owner (`readyAt` unset),
`getUnreadCounts` and `markInboxRead` fall back to scanning unread threads.
`devTools:seed` runs the backfill after seeding.

## Mark all as read

`mail.inboxRead.markInboxRead` marks every unread conversation the inbox
shows as read: the same threads `getUnreadCounts` counts (active accounts,
spam left out), optionally for one account, read from `inboxUnreadThreads`.
It collects the thread IDs once,
marks up to 50 threads (or 400 messages) per transaction, and schedules
`markThreadsReadBatch` for the rest, so mail that arrives meanwhile stays
unread. Provider read updates are spaced 250 ms apart across the whole run,
because iCloud opens an IMAP connection for each one.
