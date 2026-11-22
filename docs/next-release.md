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

## Move to the production deployment (#54)

The cutover is done ([production-migration.md](production-migration.md)).
These steps are left, each one Shawn's to do: the main checkout's
`.env.local` is off-limits to agents, and agents have no access to the
Google, Microsoft, or Notes settings.

- When: after the cutover
- Commands:
  - In the main checkout, `cd services/convex && npx convex deployment
select bentsignal:rodge-mail:dev/agents`, so `.env.local` selects
    development (`tidy-emu-857`) and new worktrees copy that. Until then it
    still selects `dazzling-dog-633`.
  - Google Cloud console, the OAuth client: add the redirect URI
    `https://colorful-ostrich-734.convex.site/providers/gmail/oauth/callback`.
  - Microsoft Entra, the app registration: add the Web redirect URI
    `https://colorful-ostrich-734.convex.site/providers/microsoft/oauth/callback`.
  - Notes' production deployment, from `~/dev/notes/services/convex`:
    `pnpm exec convex env set --prod TRANSACTIONAL_MAIL_URL
https://colorful-ostrich-734.convex.site/transactional-mail/send`, and
    the same URL in Notes' docs.
- Verify: `scripts/backend.sh status` in a new worktree names
  `tidy-emu-857`; connecting a Gmail and a Microsoft 365 account reaches
  the consent screen and returns to Freemail; Notes emails a sign-in code.

## Check tokens without fetching the signing keys (#PR)

`auth.config.ts` now reads `AUTH_JWKS`, and Convex refuses to push it to a
deployment that doesn't have the variable, so it's set first. It's the
public key set, not a secret
([AUTH.md](../services/convex/AUTH.md#signing-keys)).

- When: before the Convex deploy, and on development before `main` is
  pushed there
- Commands: from `services/convex`,
  `pnpm exec convex env set --prod AUTH_JWKS "$(curl -fsS https://colorful-ostrich-734.convex.site/api/auth/convex/jwks)"`,
  and with `.env.local` selecting development (`tidy-emu-857`),
  `pnpm exec convex env set AUTH_JWKS "$(curl -fsS https://tidy-emu-857.convex.site/api/auth/convex/jwks)"`.
- Verify: `pnpm exec convex env get --prod AUTH_JWKS` prints `{"keys":[…]}`
  with the same `kid` as the curl output; the deploy succeeds; the website
  and Freemail open signed in with mail; `pnpm exec convex logs --prod`
  shows no `GET /api/auth/*` when Freemail opens (before, each open logged
  one).
