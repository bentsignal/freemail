---
name: freemail-release
description: Run a Freemail release end to end, covering what changed since the last release, what to test where those changes meet, a first pass of those tests in the simulator, testing main in Freemail Dev on Shawn's phone, then (after his go-ahead) Convex functions to the one deployment, the website to mail.rodgers.dev, and a new local EAS build of Freemail on his iPhone. Use when Shawn asks to release, ship, deploy, push the backend or website, or put a new build on his phone, or asks what changed since the last release.
---

# Releasing Freemail

Read [docs/releasing.md](../../../docs/releasing.md) first, then
[docs/next-release.md](../../../docs/next-release.md): it lists one-off
steps this release needs beyond this skill. Do every step it lists, at the
point it says, and verify each one. A step you can't do blocks the release:
tell Shawn. After shipping, open a PR that removes the finished ones.

Releases always come from `origin/main`, never from a feature branch.
Nothing ships without Shawn's explicit go-ahead at step 4.

## 0. Get onto main

Work in a clean checkout at `origin/main`. In a T3 worktree:

```sh
git fetch origin --tags && git checkout --detach origin/main && pnpm install --frozen-lockfile
```

## 1. Plan

```sh
last="$(git tag --list 'release/*' --sort=-creatordate | head -1)"
git log --oneline "$last"..origin/main
gh pr view <n> --json title,body   # for each merged PR it lists
```

No `release/*` tag yet: ask Shawn which commit was last released. Each
merged PR's description ends with release notes; start from those and
`docs/next-release.md`. Write up for Shawn:

- **Parts:** Convex (any "Convex deploy needed: yes"), website (any change
  under `apps/web`, `shared/`, or `services/convex` that the web uses), phone
  (any change under `apps/mobile` or `shared/`; a "Native change: yes" means
  the build needs the native acceptance checks too).
- **What's new:** a short list in his words, not PR titles.
- **What to test:** only what merging could have broken. Shawn already
  tested each change on his phone in Freemail Dev before it merged (the
  `freemail-feature` skill), so don't list every change again, and don't list
  a regression pass. Look at files, components, or Convex functions more
  than one PR touched
  (`git log --format='%h %s' --name-only "$last"..origin/main`), changes
  to the same flow from different ends, and backend changes paired with app
  changes that didn't test against each other. If nothing overlaps, say so.
- **Compatibility:** for each Convex change, whether the website and the
  phone's installed build keep working between the Convex deploy and their
  own updates.

## 2. Run the test list yourself first

Before sending Shawn anything, run every step of that list yourself: the
website against the worktree's Portless origin (`pnpm exec portless proxy
start --lan`, then `pnpm -F @freemail/web dev`; never `pnpm dev`, which
runs `convex dev`), and the mobile app in the simulator (the
`freemail-simulator` skill; signed in on an isolated backend,
`scripts/backend.sh isolate`, with seeded mail, which also has the
release's Convex functions). Take a screenshot of each result and upload
them with `scripts/evidence.sh`. Fix what fails the usual way (a PR, the
`freemail-feature` skill, which Shawn approves like any other) before he sees
it, then `scripts/backend.sh teardown` and `sim.sh down`.

Send Shawn the write-up with the list in two parts:

- **Checked:** each step you ran, what you saw, any fix, and its evidence.
- **For you:** only what the simulator can't settle, each with why: how
  motion and gestures feel on a real phone, his real mail and accounts,
  real push notifications (in Freemail, after it's built), and anything
  you ran but couldn't judge.

## 3. Put main on his phone in Freemail Dev

From the release checkout (detached at `origin/main`, no isolated
backend):

```sh
scripts/phone.sh up
```

It builds a dev client only when `main`'s native fingerprint has none yet
(about 15 minutes); otherwise Shawn just taps the open link. Send him the
block it prints, first and exactly as printed (the `freemail-feature` skill,
step 4b). Freemail Dev runs `main`'s JavaScript against the functions already
on `dazzling-dog-633`. If the release has Convex changes, the parts of the
list that need them can't be tried there yet: say which, and ask whether to
deploy Convex first (step 5's Convex part, safe for the installed apps
because every Convex change stays compatible with them) so he can test
them before the website and the Freemail build ship.

Then wait. He works through the "For you" list at his own pace and either
approves ("ship it", "release it", "looks good") or asks for fixes. Fixes
found during the release test go through PRs he approves (the
`freemail-feature` skill); once they merge, update the write-up and serve
`main` again. Don't ship without an explicit approval of this release.
`scripts/phone.sh down` once he's done.

## 4. Go-ahead

Ship only after Shawn approves this release in the thread. Approval of an
earlier release, or of a PR, is not approval of this one.

## 5. Ship

In this order, skipping parts the plan doesn't need, doing each
`docs/next-release.md` step where it says:

**Convex** (from `services/convex`, whose `.env.local` points at
`dazzling-dog-633`):

```sh
cd services/convex
pnpm exec convex dev --once --tail-logs disable
```

Then call what changed (`npx convex run` on an internal query, or `curl` an
HTTP route) to check it's live, and `npx convex logs` for errors.

**Website** (from the repository root):

```sh
vercel deploy --prod
```

Open `https://mail.rodgers.dev` and check it loads and is signed in
(Shawn's session) or shows sign-in.

**Phone:** follow the `freemail-expo-build` skill's physical iPhone workflow:
the `development` profile IPA, its entitlement checks, install with
`xcrun devicectl`, and the notification acceptance gate. The phone has to
be connected (USB or the same network). If it isn't reachable, ship the
other parts and tell Shawn the build is ready to install.

Then tag what shipped and push the tag:

```sh
tag="release/$(date +%Y%m%d-%H%M)"
git tag -a "$tag" -m "<parts shipped; release notes>" && git push origin "$tag"
```

Report what shipped, the tag, and anything that didn't work.

## Rolling back

- Convex: check out the last release tag (`git checkout --detach <tag>`),
  `pnpm install --frozen-lockfile`, and push it the same way. Schema changes
  that deleted data can't be undone this way; tell Shawn.
- Website: `vercel rollback` to the previous production deployment
  (`vercel ls` lists them).
- Phone: install the previous IPA if it's still in `apps/mobile/build/`, or
  build one from the last tag.
