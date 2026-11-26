# Freemail CLI

The `freemail` command is the local, agent-friendly interface to Freemail. It
uses the system browser for authentication, stores the resulting session in a
user-only local file, and calls authenticated Convex functions directly.

```sh
pnpm --filter @freemail/cli start -- help
pnpm --filter @freemail/cli start -- auth login
pnpm --filter @freemail/cli start -- mail list
pnpm --filter @freemail/cli start -- mail search "flight receipt"
pnpm --filter @freemail/cli start -- mail get THREAD_ID
pnpm --filter @freemail/cli start -- mail sync
pnpm --filter @freemail/cli start -- mail sync --wait-for "spotify code" --timeout 120
```

`mail sync` fetches new mail from every account now and prints what arrived.
With `--wait-for QUERY` it keeps syncing until a message from the last
`--since` minutes (default 10) matches, which is how an agent picks up a
login code as soon as it lands. A timeout exits with status 1.

## Sending, deleting, and marking read

These commands act on the signed-in owner's real mail, with the same rules as
the app. Each prints one JSON object.

```sh
freemail mail send --from shawn@rodgers.dev --to friend@example.com \
  --subject "Lunch" --body "Noon works."
freemail mail delete THREAD_OR_MESSAGE_ID
freemail mail mark-read THREAD_OR_MESSAGE_ID
```

- `mail send` picks the connected account whose address is `--from` (an
  account ID from `freemail accounts` works too) and queues the message in the
  same outbox as the app's composer, so it goes out through that account's
  provider (Gmail, Microsoft 365, iCloud, or Amazon SES for hosted mailboxes)
  and shows in Sent. `--to`, `--cc`, and `--bcc` repeat or take
  comma-separated addresses. `--body-file PATH` reads the body from a file, and
  `--body-file -` from stdin, which avoids shell quoting for multi-line text.
  It waits up to 30 seconds and prints `status: "sent"` or `"failed"` (with
  `error`); `timedOut: true` means it is still queued and will keep trying.
  `--no-wait` returns as soon as it is queued. Pass the same
  `--idempotency-key` when retrying a send that may have gone through, and the
  first attempt is returned instead of sending twice.
- `mail delete` does what Archive does in the app: the whole conversation
  leaves the inbox and waits in Freemail's archive for 30 days
  (`restorableUntil`), where it can be restored. The provider's copy is
  unchanged. Given a message ID, it deletes that message's conversation.
- `mail mark-read` marks every message in the conversation read, in Freemail
  and at the provider.

Errors go to stderr as `freemail: <message>` with exit code 1.

For a directly runnable development command, link the workspace package with
`pnpm --filter @freemail/cli link --global` and then run `freemail help`.

The production Convex deployment and `https://mail.rodgers.dev` (for the
browser handoff) are used by default. Override them together with
`FREEMAIL_WEB_URL`, `FREEMAIL_CONVEX_SITE_URL`, and
`FREEMAIL_CONVEX_CLOUD_URL`.
