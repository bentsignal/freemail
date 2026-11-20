# Development

## Prerequisites

- Node.js 22
- pnpm 9
- A Convex account with access to project `rodge-mail`
- Xcode and Android Studio for native mobile builds

Run `pnpm install` from the repository root. The workspace uses Turbo, so root
scripts coordinate package tasks.

## Deployments

| What               | Where                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Website            | `https://mail.rodgers.dev`, Vercel project `bsx-sh/rodge-mail`       |
| Convex production  | `colorful-ostrich-734` (Shawn's mail)                                |
| Convex development | `tidy-emu-857` (fake owner, seeded mail, `DEV_TOOLS=true`)           |
| Isolated backends  | `dev/<branch>`, one per branch that needs it (`scripts/backend.sh`)  |
| iPhone apps        | Freemail `com.bentsignal.rodgemail`, Freemail Dev `com.bentsignal.rodgemail.dev` |

`shared/config/src/urls.ts` holds the URLs. `createUrls({ nodeEnv:
"production" })` returns production and anything else returns development.
The website built for production, the mobile app (which always asks for
production, in the simulator too), the CLI, and inbound hosted mail use
production; the local website uses development.
`shared/config/src/overrides.ts` (skip-worktree) wins over both and points a
worktree's apps elsewhere; `scripts/backend.sh isolate` writes it.

`services/convex/.env.local` selects the development deployment, so
`pnpm exec convex dev --once` pushes there. Every worktree's local website
uses development, so only a release pushes to it, with `main`, after
production ([releasing.md](releasing.md)). A branch that changes Convex
functions gets its own deployment instead: `scripts/backend.sh isolate`
creates `dev/<branch>` with a fake owner and seeded mail, and `push`,
`seed`, and `teardown` work on it ([simulator-sign-in.md](simulator-sign-in.md)).
After `teardown` the mobile app is back on production and the local website
on development. `backend.sh` refuses to write to production, development,
or `dazzling-dog-633`, the retired deployment production moved from
([production-migration.md](production-migration.md)).

## Local apps

Portless HTTPS is the primary development environment.

```sh
pnpm exec portless proxy start --lan
pnpm -F @freemail/web dev         # https://<worktree>.www.freemail.local, against development
```

Production doesn't trust local origins, so the local website can't sign in
to it. On development or an isolated backend, sign in as the
fake owner from the browser console:
`fetch('/api/auth/dev/sign-in', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })`,
then reload.

`pnpm dev:web` also runs `convex dev`, which pushes the checkout's functions
to the development deployment, and `pnpm dev` adds the Expo development
process. Agents don't use either: the push overwrites what every other
worktree's local website runs on. Both commands start Portless in LAN mode,
making the stable origins available on this Mac and other devices on the
same Wi-Fi network:

- Web: `https://www.freemail.local`
- Expo/Metro: `https://mobile.freemail.local`

The `freemail` CLI talks to production and uses `https://mail.rodgers.dev`
for browser-handoff authentication. To run it against the local website
and development, set the URL overrides in `apps/cli/README.md` and keep the
web development server and Portless proxy running when signing in.

On first use, allow Portless to install its local certificate authority. If the
certificate was removed or is not trusted, run `pnpm exec portless trust` and
restart the development command. A physical phone must also trust that local CA
before it can load the HTTPS Metro origin.

The Expo bridge sets Expo's packager proxy URL to the Portless origin, so the
development-client QR code and generated manifest use
`https://mobile.freemail.local` instead of Metro's random internal port.

The Convex development deployment trusts `https://www.freemail.local` and
every `*.freemail.local` origin, and its passkey relying-party ID is
`freemail.local`. Worktree-specific hosts remain subdomains of the same
relying-party ID.

CLI authentication opens `/desktop-auth` in the system browser. After explicit
approval, the web app redirects to the CLI's random-port loopback callback at
`http://127.0.0.1:<port>/auth/desktop-complete`. The `desktop` path names are
kept for compatibility with installed CLIs.

## Secrets

Keep deployment values in ignored `.env` or `.env.local` files. Keep server
provider secrets in Convex environment variables. Never expose OAuth client
secrets, refresh tokens, iCloud app passwords, encryption keys, AI provider
keys, mailbox contents, or attachment data through `VITE_*` or Expo public
configuration.

## Native passkeys

The native client uses the iOS AuthenticationServices and Android Credential
Manager APIs through `expo-better-auth-passkey`. The apps share the
website's relying party, `mail.rodgers.dev`
([AUTH.md](../services/convex/AUTH.md)), so their associated domain is
`webcredentials:mail.rodgers.dev` (`app.config.ts`).

- iOS fetches the Apple app-site-association file from the website
  (`apps/web/public/.well-known/apple-app-site-association`), through
  Apple's CDN, so a build needs no Metro or Portless to use passkeys.
- Android requires an `assetlinks.json` file
  ([AUTH.md](../services/convex/AUTH.md#android)). Add the SHA-256
  fingerprints for each development signing certificate used for testing.
- Add every Android APK key hash to the Better Auth passkey origin allowlist
  before testing a signed Android build.

Passkeys require a development build or signed app; the native credential
module is not available in Expo Go.

App passkeys made before the apps moved to the website's relying party (for
a Convex site host) sign in nowhere; Settings lists them under Old Passkeys.

## Mail intelligence

See [`services/convex/AI.md`](../services/convex/AI.md) for model variables,
fallback behavior, and the selective semantic-indexing boundary.

## Simulators

Agents and worktrees use `scripts/sim.sh` (the `freemail-simulator` skill)
instead of `pnpm ios`: it queues devices with every other repo on the Mac,
clones a per-worktree simulator, installs a cached dev client, and runs the
worktree's own Metro on a plain port. To test signed in, give the worktree
an isolated backend (`scripts/backend.sh isolate`) and run
`scripts/sim.sh signin`; see [simulator-sign-in.md](simulator-sign-in.md).

## Validation

Run these commands in order after changes:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run react-doctor --base origin/main   # when apps/mobile changed
pnpm run format:fix
```

`pnpm run check` runs the first three.
