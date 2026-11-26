import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { text } from "node:stream/consumers";

import type { Command, SendOptions } from "./commands.ts";
import { isAuthenticated, login, logout } from "./auth.ts";
import { parseCommand } from "./commands.ts";
import { resolveCliUrls } from "./config.ts";
import { help } from "./help.ts";
import { createMailClient } from "./mail-client.ts";

type MailClient = Awaited<ReturnType<typeof createMailClient>>;

const SEND_WAIT_MS = 30_000;
const SEND_POLL_MS = 1000;

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
  writeJson(await runMailCommand(await createMailClient(urls), command));
}

async function runMailCommand(
  client: MailClient,
  command: Exclude<
    Command,
    { kind: "auth-login" | "auth-logout" | "auth-status" | "help" }
  >,
) {
  if (command.kind === "accounts") return await client.listAccounts();
  if (command.kind === "mail-get") {
    return await client.getThread(command.threadId);
  }
  if (command.kind === "mail-send") return await sendMail(client, command);
  if (command.kind === "mail-delete") {
    return await client.deleteMail(command.id);
  }
  if (command.kind === "mail-mark-read") {
    return await client.markRead(command.id);
  }
  if (command.kind === "mail-search") {
    return await client.searchMail(command.query, mailPageArguments(command));
  }
  return await client.listMail(mailPageArguments(command));
}

async function sendMail(client: MailClient, options: SendOptions) {
  const queued = await client.sendMail({
    bcc: options.bcc,
    body: await readBody(options),
    cc: options.cc,
    from: options.from,
    idempotencyKey: options.idempotencyKey ?? `cli-${randomUUID()}`,
    subject: options.subject,
    to: options.to,
  });
  if (!options.wait) return queued;
  const deadline = Date.now() + SEND_WAIT_MS;
  for (;;) {
    const latest = await client.getSendStatus(queued.outboxId);
    if (latest?.status === "sent" || latest?.status === "failed") {
      return { ...queued, ...latest };
    }
    if (Date.now() >= deadline) {
      return { ...queued, ...latest, timedOut: true };
    }
    await new Promise((resolve) => setTimeout(resolve, SEND_POLL_MS));
  }
}

async function readBody(options: SendOptions) {
  if (options.body !== undefined) return options.body;
  if (options.bodyFile === "-") return await text(process.stdin);
  return await readFile(options.bodyFile ?? "", "utf8");
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
