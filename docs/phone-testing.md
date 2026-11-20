# Testing on Shawn's phone: Freemail Dev

Shawn tests every change on his phone before it merges, the way Vera does
it. His phone has two Freemail apps side by side:

| App          | Bundle ID and package          | What it is                                                                   | Updated by                     |
| ------------ | ------------------------------ | ---------------------------------------------------------------------------- | ------------------------------ |
| Freemail     | `com.bentsignal.rodgemail`     | The standalone `development` build he reads his mail in, JavaScript embedded | a release (`freemail-release`) |
| Freemail Dev | `com.bentsignal.rodgemail.dev` | A dev client, amber icon, loading a worktree's JavaScript from its Metro     | `scripts/phone.sh up`          |

Freemail talks to production (`colorful-ostrich-734`, his real mail).
Freemail Dev never does (`apps/mobile/src/features/auth/client.ts`): it
uses the backend of the worktree whose Metro it loaded, which is that
worktree's isolated backend (`scripts/backend.sh isolate`) or else the
shared development deployment (`tidy-emu-857`). Both hold fake mail and a
test owner, and Freemail Dev's sign-in screen has a **Sign in as test
owner** button for it (`features/auth/test-owner-button.tsx`, which posts to
the backend's dev-only `/dev/sign-in` route). So a change, its backend
functions included, works on his phone before it merges, and his real mail
stays in production. Freemail Dev never registers for push notifications
(`isFreemailDev` in `apps/mobile/src/features/dev/app-variant.ts`);
notification changes are checked in the simulator and in the release build.

**Which branch is it running?** Settings → Developer → Branch shows the
branch whose Metro served the JavaScript (`EXPO_PUBLIC_FREEMAIL_BRANCH`,
set by `scripts/lib/metro.sh`). If it isn't the branch being tested, the
phone opened another worktree's server: tap the open link again.

## The variant

`APP_VARIANT=development` (`app.config.ts`) builds Freemail Dev: name
"Freemail Dev", bundle ID and package `com.bentsignal.rodgemail.dev`, scheme
`rodge-mail-dev`, the amber icon (`assets/icons/freemail-dev.icon`, and
`freemail-dev-android-background.png` on Android), and `extra.appVariant`.
Without it Freemail's resolved config is unchanged, though its native
fingerprint still hashes the config files and icons, so adding the variant
counted as a native change.

Every development binary is Freemail Dev: the phone dev client
(`development:client`) and the simulators' (`development:client:sim`),
because one Metro per worktree serves both and Metro serves the variant's
config (`scripts/lib/metro.sh` exports `APP_VARIANT`). Only Freemail's
standalone `development` build is Freemail.

Native passkeys need `com.bentsignal.rodgemail.dev` in the website's Apple
app-site association (`apps/web/public/.well-known/apple-app-site-association`)
and `webcredentials:mail.rodgers.dev` in the build (`app.config.ts`). The
website's passkeys sign in to Freemail. The auth client sends the
`rodge-mail://` origin the backend trusts. Android passkeys in
Freemail Dev would also need its signing certificate in
`ANDROID_PASSKEY_ORIGINS` and `assetlinks.json` (services/convex/AUTH.md);
not done.

## `scripts/phone.sh`

Ported from Vera's. It builds the dev client once per native fingerprint
(a local EAS `development:client` build, under the heavy-work lock every
repo shares, cached in `~/Library/Caches/freemail/phone-dev-client-*`),
uploads its install page (`scripts/install-page.sh`, to bunny.net under
`freemail/dev-client/`), starts the worktree's Metro, puts
`tailscale serve` (HTTPS, tailnet only) in front of it, and prints open
links: an https page (`scripts/lib/open-page.html`) that opens
`rodge-mail-dev://expo-development-client/?url=…`, because chat apps only
make http and https links tappable.

```sh
scripts/phone.sh up       # build if needed, serve, print the links
scripts/phone.sh link     # the links again
scripts/phone.sh down     # stop serving; Metro stops unless a simulator uses it
scripts/phone.sh main     # main's dev client and its install link
scripts/phone.sh list     # every cached dev client, marking main's
scripts/phone.sh sweep    # stop phone servers idle for a day (sim.sh up and the Stop hook run it)
```

The phone keeps **main's dev client**, which runs every worktree that
hasn't changed native code. `up` compares the worktree's fingerprint with
main's (from a checkout of `origin/main` kept in
`~/Library/Caches/freemail/main-checkout`) and says whether Shawn only
taps the open link or installs a dev client first. After testing a
worktree with its own dev client, `phone.sh main` gives him main's back.

The phone loads JavaScript from the Mac, so it has to be on the same Wi-Fi,
or on Tailscale for the `over Tailscale` link. iOS's App Transport
Security allows plain HTTP to local network addresses but not to tailnet
(100.x) ones, so the tailnet link goes through `tailscale serve`.

The block `up` prints names the backend and branch Freemail Dev will open
on. Switching a worktree's backend (`backend.sh isolate` or `teardown`)
hot-reloads the phone onto the other backend, signed out; Shawn signs in
with **Sign in as test owner** again.

Android works the same way (`--android`), but the open links crash Freemail
Dev there (an expo-dev-launcher 57 bug, Vera's apps/mobile/README.md), so
Shawn pastes the server address into it instead. Freemail Dev for Android
hasn't been built yet.

## Apple credentials

EAS reaches Apple through the App Store Connect API key in
`~/.appstoreconnect/vera.env` (team `39K6A9FP99`, the same team as Freemail
Mail), so credentials need no Apple ID login:

```sh
cd apps/mobile
(set -a; . ~/.appstoreconnect/vera.env; set +a; expect scripts/eas-credentials.exp development:client)
```

That keeps Freemail Dev's ad hoc profile current, for example after
registering a new device. Its capability sync can report success without
changing anything: when `com.bentsignal.rodgemail.dev` was registered on
2026-11-05 it had neither Push Notifications nor Associated Domains, and
both were added through the API (`pnpm release asc POST
/v1/bundleIdCapabilities` from Vera's checkout), then the profile was
deleted and made again. Check an App ID with `pnpm release asc GET
'/v1/bundleIds?filter[identifier]=<id>&include=bundleIdCapabilities'`.
