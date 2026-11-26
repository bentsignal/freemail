import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

import type {
  GetThreadOutput,
  ListAccountsOutput,
  SearchMailOutput,
} from "@freemail/agent-contract";

import type { CliUrls } from "./config.ts";
import { authenticatedSession } from "./auth.ts";

interface MailPageArgs extends Record<string, unknown> {
  accountId?: string;
  cursor?: string;
  limit?: number;
}

const LIST_ACCOUNTS = makeFunctionReference<
  "action",
  Record<string, never>,
  ListAccountsOutput
>("cli/commands:listAccounts");
const LIST_MAIL = makeFunctionReference<
  "action",
  MailPageArgs,
  SearchMailOutput | null
>("cli/commands:listMail");
const SEARCH_MAIL = makeFunctionReference<
  "action",
  MailPageArgs & { query: string },
  SearchMailOutput | null
>("cli/commands:searchMail");
const GET_THREAD = makeFunctionReference<
  "action",
  { threadId: string },
  GetThreadOutput | null
>("cli/commands:getThread");

export interface SendMailArgs extends Record<string, unknown> {
  bcc: string[];
  body: string;
  cc: string[];
  from: string;
  idempotencyKey: string;
  subject: string;
  to: string[];
}

export type OutboxStatus = "failed" | "pending" | "sending" | "sent";

export interface SendMailResult {
  accountId: string;
  from: string;
  outboxId: string;
  reused: boolean;
  status: OutboxStatus;
}

export interface SendStatus {
  attempt: number;
  error?: string;
  outboxId: string;
  sentAt?: number;
  status: OutboxStatus;
}

const SEND_MAIL = makeFunctionReference<
  "mutation",
  SendMailArgs,
  SendMailResult
>("cli/mail:sendMail");
const GET_SEND_STATUS = makeFunctionReference<
  "query",
  { outboxId: string },
  SendStatus | null
>("cli/mail:getSendStatus");
const DELETE_MAIL = makeFunctionReference<
  "mutation",
  { id: string },
  {
    archivedMessages: number;
    deleted: true;
    mode: "archived";
    restorableUntil: number;
    threadId: string;
  }
>("cli/mail:deleteMail");
const MARK_READ = makeFunctionReference<
  "mutation",
  { id: string },
  { changedMessages: number; read: true; threadId: string }
>("cli/mail:markRead");

export async function createMailClient(urls: CliUrls) {
  const { token } = await authenticatedSession(urls);
  const client = new ConvexHttpClient(urls.convexCloud);
  client.setAuth(token);
  return {
    deleteMail: async (id: string) =>
      await client.mutation(DELETE_MAIL, { id }),
    getSendStatus: async (outboxId: string) =>
      await client.query(GET_SEND_STATUS, { outboxId }),
    getThread: async (threadId: string) =>
      await client.action(GET_THREAD, { threadId }),
    listAccounts: async () => await client.action(LIST_ACCOUNTS, {}),
    markRead: async (id: string) => await client.mutation(MARK_READ, { id }),
    sendMail: async (args: SendMailArgs) =>
      await client.mutation(SEND_MAIL, args),
    listMail: async (args: MailPageArgs) =>
      await client.action(LIST_MAIL, args),
    searchMail: async (query: string, args: MailPageArgs) =>
      await client.action(SEARCH_MAIL, { ...args, query }),
  };
}
