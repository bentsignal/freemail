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

## CLI send, delete, and mark-read (#65)

- When: after the Convex deploy (the CLI's new commands call `cli/mail:*`,
  which production doesn't have until then; nothing else depends on order)
- Commands: on the Mac, from the main checkout,
  `pnpm --filter @freemail/cli start -- mail send --from shawn@rodgers.dev
--to <your Gmail address> --subject "Freemail CLI test" --body "Sent
from the CLI."` (run `auth login` first if `auth status` says false). Then
  the same on GamerBox for Vera.
- Verify: the command prints `"status": "sent"`, the message arrives in the
  Gmail inbox, and it shows in Freemail's Sent for shawn@rodgers.dev.

## Gmail push and one-minute sync (#PR)

The deploy alone moves Gmail and Microsoft to a one-minute poll. Gmail push
(new mail in seconds) also needs a Pub/Sub topic that only Shawn can create
in the Google Cloud project that owns Freemail's OAuth client.

- When: after the Convex deploy
- Commands (Shawn, with `gcloud` signed in to that project; `PROJECT` is
  its ID, `TOKEN` a fresh random string such as `openssl rand -hex 24`):
  - `gcloud services enable pubsub.googleapis.com --project PROJECT`
  - `gcloud pubsub topics create freemail-gmail --project PROJECT`
  - `gcloud pubsub topics add-iam-policy-binding freemail-gmail --project
PROJECT --member serviceAccount:gmail-api-push@system.gserviceaccount.com
--role roles/pubsub.publisher`
  - `gcloud pubsub subscriptions create freemail-gmail-push --project
PROJECT --topic freemail-gmail --ack-deadline 30
--push-endpoint "https://colorful-ostrich-734.convex.site/providers/gmail/push?token=TOKEN"`
  - From `services/convex`: `pnpm exec convex env set --prod
GMAIL_PUSH_TOKEN TOKEN` and `pnpm exec convex env set --prod
GMAIL_PUBSUB_TOPIC projects/PROJECT/topics/freemail-gmail`
  - `pnpm exec convex run --prod providers/gmail/push:renewWatches` (the
    12-hour cron keeps it renewed after that)
- Verify: `renewWatches` prints `renewed: 1, failed: 0`; send a message to
  the Gmail address and `pnpm exec convex logs --prod` shows an
  `executeGmailSync` within a few seconds, before the next minute's cron
  tick. `mail list` in the CLI shows it without `mail sync`.
