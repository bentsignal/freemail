# Testing a change on the web

The website Shawn uses, mail.rodgers.dev, changes only in a release
(`vercel deploy --prod`). Before a change merges, he tries it on the
worktree's own website, on his Mac:

```sh
scripts/web.sh up       # start it and print the link to send Shawn
scripts/web.sh link     # the link again
scripts/web.sh status   # running or not, and which backend
scripts/web.sh down     # stop it (when the PR merges or the work is dropped)
```

`up` starts the Portless proxy (`portless proxy start --lan`) and only the
web app (`pnpm -F @freemail/web dev`, detached, logging to
`.cache/web/web.log`), waits for
`https://<worktree>.www.freemail.local` to answer, and prints a block to
send Shawn as it is: the link, and which backend it shows. Never run
`pnpm dev` or `pnpm dev:web` for this: both also run `convex dev`, which
pushes the branch's functions to the development deployment every worktree
shares.

## What Shawn sees

- **A link that opens in his browser on this Mac.** The tab title starts
  with the worktree id (`t3-8e23f2b8-… · Freemail`), so he can tell which
  worktree it is.
- **Fake mail, never his.** Production only trusts mail.rodgers.dev, so the
  local website uses the worktree's isolated backend
  (`scripts/backend.sh isolate`, with the branch's Convex functions) or
  else the shared development deployment (with the last release's functions). Both have a test
  owner and seeded mail.
- **Sign in as test owner** on the login page, under the passkey button
  (`apps/web/src/features/auth/components/dev-sign-in-button.tsx`, shown
  only by the dev server). It posts to the backend's dev-only
  `/api/auth/dev/sign-in` route, which production doesn't have.

Freemail Dev on his phone uses the same backend, so marking mail read on
one shows on the other. `scripts/backend.sh seed` resets the mailbox.

## Telling Shawn

Put the block `web.sh up` prints after the phone block, then say exactly
where the change is on the page (the control's label, and where it sits),
the steps, and what he should see. See AGENTS.md, "Telling Shawn a change is
ready to test".
