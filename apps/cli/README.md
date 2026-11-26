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

The production Convex deployment and `https://mail.rodgers.dev` (for the
browser handoff) are used by default. Override them together with
`FREEMAIL_WEB_URL`, `FREEMAIL_CONVEX_SITE_URL`, and
`FREEMAIL_CONVEX_CLOUD_URL`.

## Read-only tokens

A CLI session can do anything the apps can. For another machine, create a
read-only token instead ([AGENT_ACCESS.md](../../services/convex/AGENT_ACCESS.md)):
it can list accounts, list unread mail, search, and read threads, and
nothing else. It can't send, archive, delete, or mark mail read.

```sh
freemail tokens create --label "Vera on GamerBox" --out ~/freemail-vera-token
freemail tokens list
freemail tokens revoke TOKEN_ID
```

`create` writes the token to a new file only you can read (it refuses a
path that exists) and never prints it. Tokens last 90 days unless
`--days` says less.

## Another machine: freemail-read

[`src/freemail-read.ts`](src/freemail-read.ts) is a single file with no
dependencies. It reads the token from its own file and calls only the
read-only endpoint.

```sh
freemail-read status                 # {"ok": true, "accounts": N}
freemail-read unread --limit 20      # unread inbox conversations, newest first
freemail-read thread THREAD_ID       # one conversation (it stays unread)
freemail-read search "flight receipt"
```

The token file is `%APPDATA%\Freemail\agent-token` on Windows and
`~/.config/freemail/agent-token` elsewhere (`FREEMAIL_TOKEN_FILE` changes
it). Keep the token there, not in an assistant's config or environment.
`FREEMAIL_AGENT_URL` points it at another backend.

### Windows setup

Needs Node 22.18 or later (`winget install OpenJS.NodeJS.LTS`).

1. On the Mac: `freemail tokens create --label "Vera on GamerBox" --out
~/freemail-vera-token`, then send it over the tailnet and delete it:
   `tailscale file cp ~/freemail-vera-token gamerbox: && rm
~/freemail-vera-token`.
2. On Windows, in PowerShell:

   ```powershell
   mkdir $env:LOCALAPPDATA\Freemail -Force
   curl.exe -fsSL -o $env:LOCALAPPDATA\Freemail\freemail-read.ts https://raw.githubusercontent.com/bentsignal/freemail/main/apps/cli/src/freemail-read.ts
   tailscale file get $env:TEMP
   node $env:LOCALAPPDATA\Freemail\freemail-read.ts setup --from $env:TEMP\freemail-vera-token
   node $env:LOCALAPPDATA\Freemail\freemail-read.ts status
   ```

   `setup` saves the token to `%APPDATA%\Freemail\agent-token`, limits the
   file to your Windows account (`icacls`), and deletes the copy it read.

3. Point the assistant's tool at
   `node %LOCALAPPDATA%\Freemail\freemail-read.ts unread` and
   `... thread <id>`. It reads JSON from stdout; errors go to stderr with a
   non-zero exit.

To cut it off, `freemail tokens revoke TOKEN_ID` on the Mac. Before a token
expires, create a new one and run `setup` again.
