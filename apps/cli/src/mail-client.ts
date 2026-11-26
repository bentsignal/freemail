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

type ReadOnlyScope =
  | "accounts:read"
  | "mail:search"
  | "mail:unread"
  | "threads:read";

interface CreatedToken {
  createdAt: number;
  credentialId: string;
  expiresAt: number;
  label: string;
  token: string;
}

interface TokenSummary {
  _id: string;
  createdAt: number;
  expiresAt: number;
  label: string;
  lastUsedAt?: number;
  revokedAt?: number;
  scopes: ReadOnlyScope[];
}

export const READ_ONLY_SCOPES = [
  "accounts:read",
  "mail:unread",
  "mail:search",
  "threads:read",
] satisfies ReadOnlyScope[];

const CREATE_TOKEN = makeFunctionReference<
  "action",
  {
    accountAccess: { mode: "all" };
    expiresInDays: number;
    label: string;
    scopes: ReadOnlyScope[];
  },
  CreatedToken
>("agent/credentials:create");
const LIST_TOKENS = makeFunctionReference<
  "query",
  Record<string, never>,
  TokenSummary[]
>("agent/credentials:list");
const REVOKE_TOKEN = makeFunctionReference<
  "mutation",
  { credentialId: string },
  boolean
>("agent/credentials:revoke");

export async function createTokenClient(urls: CliUrls) {
  const { token } = await authenticatedSession(urls);
  const client = new ConvexHttpClient(urls.convexCloud);
  client.setAuth(token);
  return {
    create: async (args: { days: number; label: string }) =>
      await client.action(CREATE_TOKEN, {
        accountAccess: { mode: "all" },
        expiresInDays: args.days,
        label: args.label,
        scopes: READ_ONLY_SCOPES,
      }),
    list: async () => await client.query(LIST_TOKENS, {}),
    revoke: async (credentialId: string) =>
      await client.mutation(REVOKE_TOKEN, { credentialId }),
  };
}

export async function createMailClient(urls: CliUrls) {
  const { token } = await authenticatedSession(urls);
  const client = new ConvexHttpClient(urls.convexCloud);
  client.setAuth(token);
  return {
    getThread: async (threadId: string) =>
      await client.action(GET_THREAD, { threadId }),
    listAccounts: async () => await client.action(LIST_ACCOUNTS, {}),
    listMail: async (args: MailPageArgs) =>
      await client.action(LIST_MAIL, args),
    searchMail: async (query: string, args: MailPageArgs) =>
      await client.action(SEARCH_MAIL, { ...args, query }),
  };
}
