# Passkey authentication

Freemail uses Better Auth passkeys backed by a locally installed Convex
component. Configure these variables on each Convex deployment (`npx convex
env set --prod` for production):

- `BETTER_AUTH_SECRET`: a random Better Auth signing secret.
- `AUTH_EMAIL_FROM`: the sender for email codes, on a domain verified in
  Amazon SES, such as `Freemail <mail@rodgers.dev>`. The codes go out
  through SES with the hosted mail credentials (`HOSTED_MAIL_AWS_*`, see
  [PROVIDERS.md](PROVIDERS.md#hosted-mail-amazon-ses)). Other personal apps
  send their sign-in codes through the same SES path
  ([TRANSACTIONAL_MAIL.md](TRANSACTIONAL_MAIL.md)).
- `PASSKEY_RP_ID`: the browser WebAuthn relying-party domain, without a scheme
  or path. Local web development keeps its `.local` relying party.
- `ANDROID_PASSKEY_ORIGINS`: optional comma-separated
  `android:apk-key-hash:<BASE64_SHA256>` origins for every debug, EAS, and Play
  signing certificate that may authenticate on Android versions where
  Credential Manager cannot forward the HTTPS origin.

`CONVEX_CLOUD_URL` and `CONVEX_SITE_URL` are supplied by Convex. The auth
server uses `CONVEX_SITE_URL` as its base URL rather than the placeholder URLs
in shared app configuration. Browser clients use `/api/auth` and native
clients a separate `/api/mobile-auth` base path, and both use `PASSKEY_RP_ID`
as their relying party, so one passkey signs in to the website and the apps.
The website lists both iOS apps in its Apple app-site association
(`apps/web/public/.well-known/apple-app-site-association`), and the apps
claim `webcredentials:mail.rodgers.dev` (`apps/mobile/app.config.ts`).

Passkeys are cryptographically scoped to their relying-party ID. Changing
`PASSKEY_RP_ID` requires users to authenticate through account recovery and
register a new passkey; credentials created for the previous ID cannot migrate.

Registration verifies the email address with a single-use, five-minute Better
Auth email OTP before issuing passkey registration options. OTP verification
creates an email-verified user and authenticated session; the client then adds a
passkey through the same authenticated flow used by existing users. Email OTPs
are stored hashed and allow three attempts. Users with no passkeys can request
another registration code to resume interrupted onboarding. Passkey sign-in
remains usernameless and selects the account from the credential.

Both sign-in screens, web and mobile, offer only **Sign in with passkey**.
Passkeys are listed, added, and removed in Settings under **Freemail
account**, through Better Auth's passkey client
(`/passkey/list-user-passkeys`, `/passkey/delete-passkey`).

`emailOtpAccess` (`src/emailOtpAccess.ts`) limits Better Auth's email OTP
plugin to registration codes, on both `/api/auth` and `/api/mobile-auth`:

- `/email-otp/send-verification-otp` issues only `sign-in` codes, and only to
  an existing account with no passkey. Any other address, including one with a
  passkey, gets the same `{ success: true }` and no code is stored.
- `/sign-in/email-otp` refuses an account with a passkey (or no account) with
  the plugin's usual invalid-code error, and deletes any code stored for it.
- Every other email OTP route (password reset, email verification and change,
  code checks) answers 404.

## Signing keys

Better Auth signs the Convex tokens with the newest key in its own `jwks`
table (`/api/auth` and `/api/mobile-auth` share it). To check a token on a
new connection, Convex needs the public half. Without `AUTH_JWKS` it fetches
it from `/api/auth/convex/jwks`, an HTTP action that loads the whole auth
bundle (about 1.5 MB, mostly Better Auth and zod), so on a cold backend
every app open waited on it before its first query.

`AUTH_JWKS` holds that public key set, exactly as the route serves it, and
`auth.config.ts` passes it to Convex inline, so tokens are checked without a
request. It's public, not a secret. Empty or invalid, Convex fetches the
keys as before, but it must exist: Convex refuses to push functions whose
auth config reads a variable the deployment doesn't have (and the config
can't tell an unset variable apart without reading it).
`scripts/backend.sh push` sets it on isolated backends when it's missing.
Changing it takes effect at once, without a deploy:

```sh
npx convex env set --prod AUTH_JWKS "$(curl -fsS https://colorful-ostrich-734.convex.site/api/auth/convex/jwks)"
```

If the keys are ever rotated (Better Auth's `rotateKeys`), set it again
right after, or tokens signed with the new key are turned down and the apps
sign out. `scripts/backend.sh isolate` sets it on isolated backends.

## Email code limits

Registration and recovery codes share two token buckets in the
`@convex-dev/rate-limiter` component (`emailCodeRequest` and `emailCodeVerify`
in `src/limiter.ts`). They are global, not keyed on the client or its
headers, and live in the database, so every request and both auth instances
see the same counts:

- **Codes issued**: 5 at once, refilling at 10 a day. A request over the
  limit gets the usual `{ success: true }`, and no code is stored or sent.
- **Codes checked**: 10 at once, refilling at 20 a day. Every check against
  a pending code counts, right or wrong; over the limit, the endpoint returns
  its usual invalid-code error without checking.

A budget is spent only when a code would be issued to, or checked against, an
account that can use one, so requests for other addresses, or checks while no
code is pending, cost nothing. `createEmailCodeLimit` (`src/emailCodeLimit.ts`)
spends tokens only from an action ctx, where the spend commits even when the
request then fails; anywhere else it refuses. The Better Auth HTTP routes run
in actions.

## Which passkeys work

Until 2026-11-20 the apps used the Convex site host as their relying party,
so app passkeys from then (for `dazzling-dog-633.convex.site` and
`colorful-ostrich-734.convex.site`) sign in nowhere now. Better Auth doesn't
store a passkey's relying party, so `passkeyRpIds` (`src/passkeyRpIds.ts`) adds an
`rpId` field to the passkey row and fills it in:

- when a passkey is registered, with the relying party of the auth instance
  that verified it (`/api/auth` or `/api/mobile-auth`);
- on every successful passkey sign-in, since the signature proves which
  relying party the passkey belongs to. Passkeys registered before `rpId`
  existed get theirs the next time they sign in.

Settings lists the passkeys that work, then Other for those with no `rpId`
yet, then Old for those whose `rpId` isn't `PASSKEY_RP_ID`. The last working
passkey stays: the apps disable Remove on it, and the delete endpoint
refuses it with a message the apps show (a `before` hook, so a stale client
can't remove it either). A passkey without an `rpId` never counts as a
spare, and stays until a working one exists. Old passkeys can always be
removed.

The rules live in `@freemail/std/passkey-sign-in`, shared by the server and
both apps.

## Recovery: `/recover`

When no passkey works (a new device, a lost phone, a changed `PASSKEY_RP_ID`),
open `https://mail.rodgers.dev/recover`. Nothing links to it. It sends a
five-minute, three-attempt code to an existing account's address, without
revealing whether an address exists (`/passkey-recovery/request`). A valid code
(`/passkey-recovery/verify`) verifies ownership of that address, atomically
consumes the hashed code, and creates a normal authenticated session. It
neither replaces nor adds a passkey: after it signs you in, open Settings →
Freemail account → **Add passkey**. Both recovery endpoints draw on the
[email code limits](#email-code-limits).

The mobile app has no recovery screen, and `/recover` can't sign the app in,
which is one reason the last passkey can't be removed.

## CLI sign-in

CLI authentication uses a five-minute, PKCE-bound handoff stored in Better
Auth's verification table under the `/desktop-auth/*` endpoints. The
system-browser URL contains a random request ID. After explicit browser
approval, the web app redirects to the CLI's random-port loopback callback with
a fresh one-time authorization code. The verifier remains in the CLI, and both
factors are submitted in the final POST. The server stores only their
hashes and atomically consumes the verification record before a separate
client session is issued, preventing interception and replay.

## Android

Android also requires `https://<PASSKEY_RP_ID>/.well-known/assetlinks.json`
with the package `com.bentsignal.rodgemail` and each signing certificate's raw
SHA-256 fingerprint. The same certificates must be converted to base64 and
listed in `ANDROID_PASSKEY_ORIGINS`; the server rejects malformed entries.

## Schema changes

After changing Better Auth plugins or options that affect its schema, regenerate
the local component schema from `services/convex/src/betterAuth`. Its
`auth.ts` and `adapter.ts` list the schema-only `passkeyRpIdPlugin` next to
`passkey()` so the `rpId` field stays in the component schema:

```sh
pnpm dlx @better-auth/cli@1.4.22 generate --yes \
  --config ./auth.ts --output ./generatedSchema.ts
```

After the Convex project is configured, run `pnpm exec convex codegen` from
`services/convex` so the app and local component declarations are refreshed.
