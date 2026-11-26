import type { Command } from "./commands.ts";
import type { CliUrls } from "./config.ts";
import { isAuthenticated, login, logout } from "./auth.ts";
import { parseCommand } from "./commands.ts";
import { resolveCliUrls } from "./config.ts";
import { help } from "./help.ts";
import { createMailClient, createTokenClient } from "./mail-client.ts";
import { writeNewTokenFile } from "./token-file.ts";

export async function main(arguments_: string[]) {
  const command = parseCommand(arguments_);
  const urls = resolveCliUrls();
  if (command.kind === "help") {
    writeText(help(command.topic));
    return;
  }
  if (command.kind === "auth-login") {
    await login(urls);
    writeJson({ authenticated: true });
    return;
  }
  if (command.kind === "auth-logout") {
    await logout(urls);
    writeJson({ authenticated: false });
    return;
  }
  if (command.kind === "auth-status") {
    writeJson({ authenticated: await isAuthenticated(urls) });
    return;
  }
  if (isTokensCommand(command)) {
    writeJson(await runTokensCommand(command, urls));
    return;
  }
  const client = await createMailClient(urls);
  if (command.kind === "accounts") {
    writeJson(await client.listAccounts());
  } else if (command.kind === "mail-get") {
    writeJson(await client.getThread(command.threadId));
  } else if (command.kind === "mail-search") {
    writeJson(
      await client.searchMail(command.query, mailPageArguments(command)),
    );
  } else {
    writeJson(await client.listMail(mailPageArguments(command)));
  }
}

type TokensCommand = Extract<
  Command,
  { kind: "tokens-create" | "tokens-list" | "tokens-revoke" }
>;

function isTokensCommand(command: Command): command is TokensCommand {
  return command.kind.startsWith("tokens-");
}

async function runTokensCommand(command: TokensCommand, urls: CliUrls) {
  const tokens = await createTokenClient(urls);
  if (command.kind === "tokens-list") return await tokens.list();
  if (command.kind === "tokens-revoke") {
    return { revoked: await tokens.revoke(command.credentialId) };
  }
  return await writeNewTokenFile(
    command.out,
    async () => await tokens.create(command),
  );
}

function mailPageArguments(command: {
  accountId?: string;
  cursor?: string;
  limit?: number;
}) {
  return {
    ...(command.accountId ? { accountId: command.accountId } : {}),
    ...(command.cursor ? { cursor: command.cursor } : {}),
    ...(command.limit ? { limit: command.limit } : {}),
  };
}

function writeJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeText(value: string) {
  process.stdout.write(`${value}\n`);
}
