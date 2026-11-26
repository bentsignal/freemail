# Read-only agent access

Another machine (Vera on GamerBox, say) reads mail through one Convex HTTP
action, `POST /agent/v1/tools`, with a dedicated bearer token instead of a
Freemail session. A session can call every function the apps can, sending
and deleting included; a token can't.

## Tokens

`freemail tokens create --out FILE` (the CLI, signed in as the owner) calls
`agent/credentials:create` and writes the token to a new file only the user
can read. It never prints it. `freemail tokens list` and `freemail tokens
revoke <id>` manage them; revocation takes effect on the next request.

Each token has a label, an expiry (1 to 90 days, default 90 from the CLI),
an explicit scope list, and access to every account or an allowlist. Convex
stores only a domain-separated SHA-256 hash; the plaintext exists only in
the file. The CLI grants every read scope and all accounts.

## Tools

The endpoint dispatches exactly four tools, each with its own scope:

- `list_accounts` needs `accounts:read`.
- `list_unread` needs `mail:unread`: the unread conversations the inbox
  shows (the same threads as `getUnreadCounts`: active accounts, spam left
  out), newest first, with the total.
- `search_mail` needs `mail:search`.
- `get_thread` needs `threads:read`.

All four run queries, or an action that only runs queries, so nothing here
can send, archive, delete, label, or mark mail read; reading a thread
through it leaves it unread. There are no credential-management or
attachment-body tools. Every query rechecks the token's owner and account
access, and a token restricted to several accounts must name `accountId`
when searching.

Mail is projected into strict DTOs (`@freemail/agent-contract`). Provider
tokens, remote IDs, raw HTML, storage IDs, and classification internals are
never returned. Bodies, recipients, attachments, results, requests, and
responses are capped, and every response marks mail as untrusted content so
callers don't treat it as instructions.

## Audit and limits

Requests are rate limited per token (`agentRead`). A successful read returns
mail only after its `succeeded` audit event is stored; denied and failed
requests are audited best-effort. Audit rows hold a request ID, the token's
fingerprint, a token-bound argument hash, the tool, the outcome, the
duration, the result count, and a safe error code, never the token, the
arguments, or mail. Audits are kept 90 days, and expired tokens are deleted
90 days after they expire.

## Clients

`apps/cli/src/freemail-read.ts` is the client for other machines: one file
with no dependencies, run with Node 22.18 or later. Setup on Windows is in
[apps/cli/README.md](../../apps/cli/README.md#another-machine-freemail-read).
