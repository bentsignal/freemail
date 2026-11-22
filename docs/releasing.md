# Releasing

Merging to `main` ships nothing. Shawn decides when to release, and an
agent runs it with the `freemail-release` skill. Each change was tested on his
phone in Freemail Dev before it merged ([phone-testing.md](phone-testing.md));
the release tests where the merged changes meet, first in the simulator,
then `main` in Freemail Dev on his phone against the development deployment,
and ships only after he approves it. Checks on his real mail happen in
Freemail once it ships.
A release has up to three parts, always from `origin/main`, in this order:

| Part          | What it updates                                         | Command                                                       | Needed when                                  |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| Convex        | functions and schema on `colorful-ostrich-734`          | `pnpm exec convex deploy -y` from `services/convex`           | a merged PR said "Convex deploy needed: yes" |
| Website       | `https://mail.rodgers.dev` (Vercel `bsx-sh/rodge-mail`) | `vercel deploy --prod` from the repository root               | `apps/web` or a package it uses changed      |
| Shawn's phone | Freemail, the standalone build on his iPhone            | local EAS `development` IPA (the `freemail-expo-build` skill) | `apps/mobile` or a package it uses changed   |

Convex goes first so the website and phone never call functions that
don't exist yet. That only works if every Convex change stays compatible
with the clients before it (the `freemail-feature` skill, step 2): the
website keeps its old bundle until its deploy, and the phone keeps its
embedded JavaScript until Shawn installs a new build.

## Deployments

Convex project `rodge-mail` (team `bentsignal`):

| Deployment             | Reference    | What it is                                                                        |
| ---------------------- | ------------ | --------------------------------------------------------------------------------- |
| `colorful-ostrich-734` | `production` | Shawn's real mail: the website, Freemail, the CLI, SES mail                       |
| `tidy-emu-857`         | `dev/agents` | Development: a fake owner and seeded mail, for Freemail Dev and the local website |
| `dazzling-dog-633`     | `dev/shawn`  | Retired and paused, the rollback copy of the move to production                   |

`convex deploy` targets the project's production deployment whatever
`services/convex/.env.local` selects. After the production deploy the
release also pushes `main` to development, or it falls behind. Name the
deployment: a worktree's `.env.local` can still select `dazzling-dog-633`:

```sh
cd services/convex
pnpm exec convex deploy -y
CONVEX_DEPLOYMENT=dev:tidy-emu-857 pnpm exec convex dev --once --tail-logs disable
```

`convex dev --once` pushes once and exits; never leave `convex dev` running.
Other commands reach production with `--prod` (`npx convex logs --prod`,
`npx convex env list --prod`).

Nothing uses `dazzling-dog-633`, which served production before the move
([production-migration.md](production-migration.md)). Never push to it,
unpause it, or change its data; Shawn deletes it when he no longer needs
the rollback.

## Production environment

Production runs with `ENVIRONMENT=production`, so it trusts only
`https://mail.rodgers.dev`, the passkey relying-party origin, and the
`rodge-mail://` app origin. Local origins (`*.freemail.local`) can't sign in
to it. Set its environment variables with `npx convex env set --prod <name>
<value>`; without `--prod` the command changes development.

## The phone

The phone runs a standalone EAS `development` build (internal
distribution, its JavaScript embedded, no expo-updates and no update
channel), so JavaScript and native changes alike reach it only in a new
build. `app.config.ts` only allows `development*` EAS profiles. Building and
installing it, and the notification checks every build must pass, are in
the `freemail-expo-build` skill.

Development uses a different app, Freemail Dev (`com.bentsignal.rodgemail.dev`):
the simulators' `development:client:sim` dev client (`scripts/sim.sh`) and
the phone's `development:client` dev client (`scripts/phone.sh`), each
cached per native fingerprint. Freemail Dev sits next to Freemail on the
phone and loads a worktree's JavaScript from its Metro, against that
worktree's backend (never production), so testing needs no release
([phone-testing.md](phone-testing.md)).

## Release notes and extra steps

Every PR's description ends with release notes ("Convex deploy needed",
"Native change", "Extra release steps"), checked by CI
(`scripts/check-release-steps.ts`, `.github/workflows/mobile-fingerprint.yml`).
The release starts from those. Anything else a release has to do (Convex
environment variables, DNS or AWS setup, an order, checks after shipping)
is in [next-release.md](next-release.md), added by the PR that needs it.

## Tags

Each release tags the commit it shipped, `release/<YYYYMMDD-HHMM>`, and
pushes the tag. The next release lists what changed since the newest
`release/*` tag (`git log --oneline <tag>..origin/main`). Until the first
tag exists, ask Shawn which commit was last released.
