# Next release: extra steps

One-off steps the next release needs on top of the normal flow in
[releasing.md](releasing.md). The `rodge-release` skill requires working
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
- Verify: Settings → Rodge Mail account on the website lists the passkey
  you just used under "Website passkeys", with Remove disabled if it's the
  only one there. The passkeys still under "Other passkeys" are the phone's
  and any unused ones.

## Send email codes through Amazon SES instead of Resend (#44)

Sign-in and verification codes now go out through SES with the hosted mail
credentials, from `AUTH_EMAIL_FROM`. `rodgers.dev` is already verified in
SES with production access, and the `rodge-mail-convex` IAM user may send
from any verified identity, so no AWS change is needed.

- When: right after the Convex deploy (the new functions send through SES
  as soon as they're live; the old ones still need the Resend key until
  then).
- Commands, from `services/convex`:

  ```sh
  pnpm exec convex env set AUTH_EMAIL_FROM 'Rodge Mail <mail@rodgers.dev>'
  pnpm exec convex env remove RESEND_API_KEY
  ```

- Verify: open `https://mail.rodgers.dev/recover`, request a code for
  Shawn's address, and check it arrives from `mail@rodgers.dev` (not in
  spam). The send also shows up in
  `aws sesv2 get-account --region us-east-1 --query SendQuota.SentLast24Hours`.
  Then Shawn can close the Resend account. Neither `rodgers.dev` nor
  `bentsignal.com` has Resend DNS records; if the old sender's domain was
  another one, remove its `resend._domainkey` and `send.` records there.
