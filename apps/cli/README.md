# Freemail CLI

The `freemail` command is the local, agent-friendly interface to Freemail. It
uses the system browser for authentication, stores the resulting session in a
user-only local file, and calls authenticated Convex functions directly.

```sh
pnpm --filter @freemail/cli start -- help
pnpm --filter @freemail/cli start -- auth login
pnpm --filter @freemail/cli start -- mail list
pnpm --filter @freemail/cli start -- mail search "flight receipt"
pnpm --filter @freemail/cli start -- mail get THREAD_ID
```

For a directly runnable development command, link the workspace package with
`pnpm --filter @freemail/cli link --global` and then run `freemail help`.

The development deployment URLs are used by default. Override them together
with `FREEMAIL_WEB_URL`, `FREEMAIL_CONVEX_SITE_URL`, and
`FREEMAIL_CONVEX_CLOUD_URL`.
