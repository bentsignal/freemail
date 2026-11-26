# Next release: extra steps

One-off steps the next release needs on top of the normal flow in
[releasing.md](releasing.md). The `freemail-release` skill requires working
through this file. Do every step in order, and check each one's **Verify**
before moving on. A step that fails or can't be done blocks the release;
tell Shawn instead of skipping it.

After the release, open a PR that removes the finished steps (leave the
heading and intro so the file stays in place for the next release).

Adding steps: any PR whose release needs something beyond deploying adds a
section here in that PR (see AGENTS.md → Releases), in this form:

```md
## <what> (#<PR>)

- When: before / after the Convex deploy, the website deploy, or the phone build
- Commands: ...
- Verify: ...
```

## Move to the production deployment (#54)

The cutover is done ([production-migration.md](production-migration.md)).
These steps are left, each one Shawn's to do: the main checkout's
`.env.local` is off-limits to agents, and agents have no access to the
Google, Microsoft, or Notes settings.

- When: after the cutover
- Commands:
  - In the main checkout, `cd services/convex && npx convex deployment
select bentsignal:rodge-mail:dev/agents`, so `.env.local` selects
    development (`tidy-emu-857`) and new worktrees copy that. Until then it
    still selects `dazzling-dog-633`.
  - Google Cloud console, the OAuth client: add the redirect URI
    `https://colorful-ostrich-734.convex.site/providers/gmail/oauth/callback`.
  - Microsoft Entra, the app registration: add the Web redirect URI
    `https://colorful-ostrich-734.convex.site/providers/microsoft/oauth/callback`.
  - Notes' production deployment, from `~/dev/notes/services/convex`:
    `pnpm exec convex env set --prod TRANSACTIONAL_MAIL_URL
https://colorful-ostrich-734.convex.site/transactional-mail/send`, and
    the same URL in Notes' docs.
- Verify: `scripts/backend.sh status` in a new worktree names
  `tidy-emu-857`; connecting a Gmail and a Microsoft 365 account reaches
  the consent screen and returns to Freemail; Notes emails a sign-in code.

## Count unread mail from counters (#62)

`getUnreadCounts` scans unread threads until the counters are backfilled
once on production.

- When: right after the Convex deploy
- Commands: from `services/convex`,
  `pnpm exec convex run --prod mail/inboxUnreadBackfill:backfill '{}'`. It
  schedules itself in batches of 50 threads and finishes within a minute.
- Verify: `pnpm exec convex data --prod inboxUnreadCounts` shows one
  document with `readyAt` set, and the unread counts in Freemail (the
  inbox's account switcher) are what they were before the deploy. In
  `pnpm exec convex logs --prod --success`, `mail/queries:getUnreadCounts`
  runs read a few KB, and the next `providers/icloud/sync:synchronize` runs
  call `sync/internal:getProviderMessageReadStates` once per mailbox at most
  and never `listProviderMessageStatesPage`. The day after, Convex's usage
  page shows Freemail's database bandwidth at a small fraction of the
  ~2 GB/day before.
