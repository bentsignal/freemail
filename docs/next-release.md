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

## Sort existing passkeys by platform (#33)

Passkeys stored before this release have no `rpId`, so Settings lists them
under "Other passkeys" and won't remove any of them until both the website
and the iPhone app have a sorted passkey. Each one is sorted the next time it
signs in. Nothing in the stored rows tells the platforms apart reliably, so
there's no backfill command.

- When: after the Convex deploy and the website deploy
- Commands: none. On the website, sign out and sign back in with a passkey.
  Don't sign the phone out for this: its passkeys get sorted the next time
  it signs in on its own.
- Verify: Settings → Freemail account on the website lists the passkey
  you just used under "Website passkeys", with Remove disabled if it's the
  only one there. The passkeys still under "Other passkeys" are the phone's
  and any unused ones.

## Rename to Freemail (#47)

The app, website, email codes, and passkey prompts now say Freemail. Bundle
IDs and URL schemes didn't change, so the new phone build installs over the
current one and stays signed in with notifications on.

- When: after the Convex deploy, the website deploy, and the phone build
- Commands: none beyond the normal release.
- Verify: the home screen icon is named "Freemail"; the website's top-left
  says Freemail and the tab title ends in "Freemail"; Settings on the phone
  shows "Freemail Account". Shawn's Mac: the CLI is now `freemail`
  (`pnpm --filter @freemail/cli link --global`, then `freemail auth login`,
  since its session moved from `~/.config/rodge` to `~/.config/freemail`).

## Call models through the Convex AI Gateway (#49)

Classification, clean views, and embeddings now go through the Convex AI
Gateway instead of straight to OpenAI, with the same models. The functions
no longer read `OPENAI_API_KEY`, so it can be removed once the deploy is
confirmed working.

- When: after the Convex deploy
- Commands: wait for new mail to arrive (or open an email without a clean
  view), then, from `services/convex` on main:
  `pnpm exec convex data aiUsage --limit 5 --order desc`. Once that works:
  `pnpm exec convex env remove OPENAI_API_KEY`
- Verify: the newest `aiUsage` rows have `status: "complete"` with real
  `inputTokens` and `outputTokens`, the newest `messageClassifications` have
  `source: "model"` with no `error`, and the Convex dashboard's usage page
  shows AI Gateway spend. After removing the key, `convex env list` has no
  `OPENAI_API_KEY`. The OpenAI API key can then be revoked in OpenAI's
  dashboard.

## Transactional mail for other apps (#50)

The new `/transactional-mail/send` endpoint lets Notes (notes.rodgers.dev)
send its sign-in codes through Freemail's SES
([TRANSACTIONAL_MAIL.md](../services/convex/TRANSACTIONAL_MAIL.md)). Until
`TRANSACTIONAL_MAIL_CLIENTS` is set it answers 401 to everyone.

- When: after the Convex deploy
- Commands: from `services/convex` on main:

  ```sh
  pnpm exec convex env set TRANSACTIONAL_MAIL_CLIENTS '[{"name":"notes","tokenSha256":"6ca52bc1e3dd34cb3dfdc1902f8292ba80e37eccc414fd89843458e4d603bbaf","from":"notes@rodgers.dev","fromName":"Notes","to":["shawn@rodgers.dev"]}]'
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    -H 'Content-Type: application/json' -d '{}' \
    https://dazzling-dog-633.convex.site/transactional-mail/send
  ```

- Verify: `pnpm exec convex env get TRANSACTIONAL_MAIL_CLIENTS` prints the
  entry, and the `curl` with no token prints `401` (a `500` means the JSON
  didn't parse; `404` means the deploy didn't include the route). Then
  request a sign-in code on notes.rodgers.dev: it arrives at
  shawn@rodgers.dev from "Notes" <notes@rodgers.dev>, and
  `pnpm exec convex logs` shows `transactional mail: sent for notes` with no
  address, subject, or code in it. Tell the Notes thread the endpoint is
  live.
