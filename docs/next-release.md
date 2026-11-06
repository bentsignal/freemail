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
