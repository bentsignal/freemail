---
name: merge
description: Use whenever Shawn asks you to merge this thread's pull request or approves it to merge, such as "merge it", "merge", "ship it", or "approved". Never merge without that approval in the thread; CI passing and your own review are not approval.
---

# Merge

Shawn's approval to merge covers the PRs linked to this thread and nothing
else, and everything that follows a merge: the dev server and devices come
down and the thread is settled. Without his approval in this thread, stop:
a green PR waits for him. Merging releases nothing (the `freemail-release`
skill does that). Once approved, do each step that applies, in order,
without asking.

## 1. Stop what's running

The dev server has been up since the work was ready to test. Bring it and
every device down, then check nothing is left. First call `device_list`
and `device_close` every device it shows open in this thread's Device
panel. Then:

```sh
scripts/phone.sh down; scripts/phone.sh --android down
scripts/sim.sh down; scripts/sim.sh --android down
scripts/sim.sh status        # ios: none, android: none, metro: stopped
xcrun simctl list devices | grep "Freemail $(basename "$PWD")" || echo gone
```

Stop a web dev server you started in this worktree (only its own process).
If a simulator won't shut down (stuck "Shutting Down"), the Mac's simulator
service is jammed: tell Shawn in your report, and don't settle the thread
as if everything is stopped. If this worktree had its own dev client,
`phone.sh down` prints main's install link: send it so Shawn can put
main's dev client back.

## 2. Check the PR is ready

- Nothing uncommitted or unpushed in the worktree (`git status`, then
  `git push`).
- CI passed on the PR's latest commit (`gh pr checks <number>`). Fix
  failures before merging, and tell Shawn if a fix changed what he tested.
- If the PR's description no longer matches the change (later feedback
  rounds), update it, release notes included.

## 3. Merge

Squash and merge, with the PR's title as the subject (the release plan
finds PRs by the `(#<number>)` at its end):

```sh
gh pr merge <number> --squash --subject "<PR title> (#<number>)" --delete-branch
gh pr view <number> --json state     # MERGED
```

Use `--merge` instead only when there's a reason to keep the branch's
commits as they are, and say why in your report. A stack is one: each
layer above contains the commits of the one below, so squashing a layer
leaves the next one replaying it. Merge a stack with `--merge` from the
bottom up, retargeting each layer to `main` as the one below it merges.

`gh pr merge` may say it can't switch to `main` because another checkout has
it. The merge still happened. Delete the remote branch with
`git push origin --delete <branch>` if it's still there.

If the worktree has an isolated backend, `scripts/backend.sh teardown`.
Don't deploy anything, even when the PR says "Convex deploy needed: yes".
That happens in the next release.

## 4. Settle the T3 thread

- `list_thread_pull_requests`: every PR from this work is linked and
  merged. Link any that's missing.
- `unwatch_pull_request` for each PR being watched.
- `t3_thread_organize` with `action: "settle"`. It takes effect when your
  turn ends.

## 5. Report

Say what was merged (PR link), that it isn't released yet (whether it needs
a Convex deploy, a website deploy, or a Freemail build when it is), and
any extra release steps it added to `docs/next-release.md`. Keep it short.
