# Default mail app and verification codes on iOS

Two iPhone features that come from how iOS treats mail apps. Researched and
tested in November 2026, against the iOS 27.0 simulator.

## Default mail app

iOS lists an app under Settings → Apps → Default Apps → Email only if it has
the `com.apple.developer.mail-client` entitlement, which Apple grants on
request. Registering `mailto:` isn't enough.

**In the app today:** `mailto:` is registered
(`apps/mobile/expo-plugins/with-ios-mailto-scheme.cjs`), and a link opens the
composer with To, Cc, Bcc, Subject, and Body filled in
(`apps/mobile/src/app/+native-intent.tsx`). `mailto:` links inside an email
open the composer whatever the default is. Until Apple grants the entitlement,
links from other apps still go to the current default.

**Not in the app:** the entitlement. Don't add it before the grant: signing
fails with "Entitlement com.apple.developer.mail-client not found", which would
block every phone build.

### Getting it

1. Shawn, as the Apple Developer Account Holder, submits
   <https://developer.apple.com/contact/request/default-mail-client> for the
   App ID `com.bentsignal.rodgemail`. Agents can't do this.
2. Ask for **Ad Hoc** as well as Development and App Store. The phone's
   `development` profile uses `distribution: internal`, which EAS signs ad hoc,
   and Apple commonly grants only the other two
   ([thread 849105](https://developer.apple.com/forums/thread/849105),
   [thread 841667](https://developer.apple.com/forums/thread/841667)). If it's
   missing, ask through Apple Developer → Contact Us → Development and
   Technical → Entitlements
   ([thread 800072](https://developer.apple.com/forums/thread/800072)).
3. After the grant, in one PR: add
   `entitlements: { "com.apple.developer.mail-client": true }` under `ios` in
   `apps/mobile/app.config.ts`, change the `app.config.test.ts` check, and list
   the phone build in `docs/next-release.md`.
4. Verify on the phone: Rodge Mail appears under Default Apps → Email, and after
   choosing it, a `mailto:` link in Safari opens the composer. `codesign -d
--entitlements :-` on the build should list the entitlement.

Apple's stated requirements are the `mailto:` scheme, sending to any recipient,
and receiving from any sender
([entitlement docs](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.mail-client)).
Rodge Mail meets all three. Nothing Apple publishes says whether it grants this
to an app that isn't on the App Store. If it refuses ad hoc, TestFlight is the
fallback, which needs a new EAS profile (`app.config.ts` allows only
`development*` today).

## Verification codes on the keyboard

Since iOS 26, the system picks codes out of delivered notifications from any
app, with no entitlement or API, and offers them as "From Rodge Mail" above the
keyboard ([WhatsApp's description](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/keyboard-suggestions)
is the best public one; Apple doesn't document it for iOS). So iOS sees only what
the push says, and Rodge's push used to show just the subject.

The push now adds a line when the mail has a code
(`services/convex/src/notifications/verificationCode.ts`): the subject, then
`Your verification code is 483920`. Codes further down the message reach iOS this
way.

What the simulator showed, pushing to Rodge with a code field focused in Safari:

| Notification body                    | Offered |
| ------------------------------------ | ------- |
| `Your verification code is 483920`   | yes     |
| `Verification code: 111201`          | yes     |
| `Sign in to GitHub⏎Your verification code is 444504` | yes |
| `555605 is your security code`       | yes     |
| `Your login code is 999109`          | yes     |
| `Your confirmation code: 121314`     | yes     |
| `Your verification code is AB77CD`   | yes     |
| `Launch plan 222302`                 | no      |
| `Invoice 333403 is ready`            | no      |
| `888908` (titled "Verification")     | no      |

Limits:

- It needs notifications on for the account with previews included. With
  previews off the push says "New message", and the code stays out of it.
- A code in the push passes through Expo and Apple in clear text, as subjects
  already do.
- The push is sent after sync, so timing depends on the provider. Gmail gets a
  Pub/Sub wake-up. Microsoft 365 and iCloud sync on the five-minute cron
  (`crons.ts`), so a code can arrive up to five minutes late. Real use there
  needs a faster wake-up, such as Graph change notifications or IMAP IDLE.
- Detection in the body is deliberately cautious: a code it doesn't recognize
  just means no suggestion.
- WhatsApp's page says autofill doesn't trigger while the app is in the
  foreground, which matters little here because the code field is in another app.

Another route is a credential provider extension (`ProvidesOneTimeCodes`).
[Apple's docs](https://developer.apple.com/documentation/authenticationservices/providing-one-time-passcodes-to-autofill)
describe it as a list behind a tap, aimed at password managers, so it wasn't
tried.
