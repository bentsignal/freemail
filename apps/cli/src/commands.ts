/* eslint-disable complexity, no-restricted-syntax -- This small CLI parser keeps its discriminated command contract explicit. */
import type { SyncOptions } from "./sync.ts";

export type Command =
  | { kind: "accounts" }
  | { kind: "auth-login" }
  | { kind: "auth-logout" }
  | { kind: "auth-status" }
  | { kind: "help"; topic?: "auth" | "mail" }
  | {
      accountId?: string;
      cursor?: string;
      kind: "mail-list";
      limit?: number;
    }
  | { kind: "mail-get"; threadId: string }
  | { id: string; kind: "mail-delete" }
  | { id: string; kind: "mail-mark-read" }
  | ({ kind: "mail-send" } & SendOptions)
  | ({ kind: "mail-sync" } & SyncOptions)
  | {
      accountId?: string;
      cursor?: string;
      kind: "mail-search";
      limit?: number;
      query: string;
    };

export interface SendOptions {
  bcc: string[];
  body?: string;
  bodyFile?: string;
  cc: string[];
  from: string;
  idempotencyKey?: string;
  subject: string;
  to: string[];
  wait: boolean;
}

export function parseCommand(arguments_: string[]): Command {
  const normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const [group, action, ...rest] = normalized;
  if (!group || group === "help" || group === "--help" || group === "-h") {
    return { kind: "help" };
  }
  if (group === "auth") return parseAuthCommand(action, rest);
  if (group === "accounts") return { kind: "accounts" };
  if (group === "mail") return parseMailCommand(action, rest);
  throw new Error(`Unknown command: ${group}. Run \`freemail help\`.`);
}

function parseAuthCommand(action: string | undefined, rest: string[]) {
  if (!action || action === "help" || action === "--help") {
    return { kind: "help", topic: "auth" } satisfies Command;
  }
  assertNoArguments(rest, `auth ${action}`);
  if (action === "login") return { kind: "auth-login" } satisfies Command;
  if (action === "logout") return { kind: "auth-logout" } satisfies Command;
  if (action === "status") return { kind: "auth-status" } satisfies Command;
  throw new Error(
    `Unknown auth command: ${action}. Run \`freemail auth help\`.`,
  );
}

function parseMailCommand(action: string | undefined, rest: string[]): Command {
  if (!action || action === "help" || action === "--help") {
    return { kind: "help", topic: "mail" };
  }
  if (action === "get") {
    const [threadId, ...extra] = rest;
    if (!threadId) throw new Error("mail get requires a thread ID");
    assertNoArguments(extra, "mail get");
    return { kind: "mail-get", threadId };
  }
  if (action === "delete" || action === "mark-read") {
    const [id, ...extra] = rest;
    if (!id) throw new Error(`mail ${action} requires a thread or message ID`);
    assertNoArguments(extra, `mail ${action}`);
    return { id, kind: action === "delete" ? "mail-delete" : "mail-mark-read" };
  }
  if (action === "send")
    return { kind: "mail-send", ...parseSendOptions(rest) };
  if (action === "sync")
    return { kind: "mail-sync", ...parseSyncOptions(rest) };
  const { options, positionals } = parseMailOptions(rest);
  if (action === "list") {
    assertNoArguments(positionals, "mail list");
    return { kind: "mail-list", ...options };
  }
  if (action === "search") {
    if (positionals.length === 0) {
      throw new Error("mail search requires a query");
    }
    return {
      kind: "mail-search",
      query: positionals.join(" "),
      ...options,
    };
  }
  throw new Error(
    `Unknown mail command: ${action}. Run \`freemail mail help\`.`,
  );
}

function parseMailOptions(values: string[]) {
  const options: { accountId?: string; cursor?: string; limit?: number } = {};
  const positionals = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--account") {
      options.accountId = requiredOptionValue(values, ++index, value);
    } else if (value === "--cursor") {
      options.cursor = requiredOptionValue(values, ++index, value);
    } else if (value === "--limit") {
      const limit = Number(requiredOptionValue(values, ++index, value));
      if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
        throw new Error("--limit must be an integer between 1 and 25");
      }
      options.limit = limit;
    } else if (value?.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    } else if (value) {
      positionals.push(value);
    }
  }
  return { options, positionals };
}

function parseSendOptions(values: string[]): SendOptions {
  const options: Partial<SendOptions> & {
    bcc: string[];
    cc: string[];
    to: string[];
  } = { bcc: [], cc: [], to: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--to") {
      options.to.push(...addressesOption(values, ++index, value));
    } else if (value === "--cc") {
      options.cc.push(...addressesOption(values, ++index, value));
    } else if (value === "--bcc") {
      options.bcc.push(...addressesOption(values, ++index, value));
    } else if (value === "--from") {
      options.from = requiredOptionValue(values, ++index, value);
    } else if (value === "--subject") {
      options.subject = requiredOptionValue(values, ++index, value, true);
    } else if (value === "--body") {
      options.body = requiredOptionValue(values, ++index, value, true);
    } else if (value === "--body-file") {
      options.bodyFile = requiredOptionValue(values, ++index, value, true);
    } else if (value === "--idempotency-key") {
      options.idempotencyKey = requiredOptionValue(values, ++index, value);
    } else if (value === "--no-wait") {
      options.wait = false;
    } else {
      throw new Error(`Unknown option for mail send: ${value}`);
    }
  }
  if (!options.from) throw new Error("mail send requires --from <address>");
  if (options.to.length === 0) {
    throw new Error("mail send requires --to <address>");
  }
  if (options.subject === undefined) {
    throw new Error("mail send requires --subject <text>");
  }
  if ((options.body === undefined) === (options.bodyFile === undefined)) {
    throw new Error("mail send requires exactly one of --body or --body-file");
  }
  return {
    ...options,
    from: options.from,
    subject: options.subject,
    wait: options.wait ?? true,
  };
}

const DEFAULT_SYNC_TIMEOUT_SECONDS = 30;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 120;
const DEFAULT_SINCE_MINUTES = 10;

function parseSyncOptions(values: string[]): SyncOptions {
  const options: Partial<SyncOptions> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--account") {
      options.accountId = requiredOptionValue(values, ++index, value);
    } else if (value === "--wait-for") {
      options.waitFor = requiredOptionValue(values, ++index, value, true);
      if (options.waitFor.trim().length < 2) {
        throw new Error("--wait-for needs at least 2 characters");
      }
    } else if (value === "--timeout") {
      options.timeoutSeconds = positiveNumber(values, ++index, value, 600);
    } else if (value === "--since") {
      options.sinceMinutes = positiveNumber(values, ++index, value, 1440);
    } else if (value === "--json") {
      continue;
    } else {
      throw new Error(`Unknown option for mail sync: ${value}`);
    }
  }
  return {
    ...options,
    sinceMinutes: options.sinceMinutes ?? DEFAULT_SINCE_MINUTES,
    timeoutSeconds:
      options.timeoutSeconds ??
      (options.waitFor === undefined
        ? DEFAULT_SYNC_TIMEOUT_SECONDS
        : DEFAULT_WAIT_TIMEOUT_SECONDS),
  };
}

function positiveNumber(
  values: string[],
  index: number,
  option: string,
  max: number,
) {
  const number = Number(requiredOptionValue(values, index, option));
  if (!Number.isFinite(number) || number <= 0 || number > max) {
    throw new Error(`${option} must be a number between 1 and ${max}`);
  }
  return number;
}

function addressesOption(values: string[], index: number, option: string) {
  return requiredOptionValue(values, index, option)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function requiredOptionValue(
  values: string[],
  index: number,
  option: string,
  allowDashes = false,
) {
  const value = values[index];
  if (
    value === undefined ||
    (!allowDashes && (!value || value.startsWith("--")))
  ) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function assertNoArguments(values: string[], command: string) {
  if (values.length > 0) {
    throw new Error(`${command} does not accept: ${values.join(" ")}`);
  }
}
