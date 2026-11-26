/* eslint-disable complexity, no-restricted-syntax -- This small CLI parser keeps its discriminated command contract explicit. */
export type Command =
  | { kind: "accounts" }
  | { kind: "auth-login" }
  | { kind: "auth-logout" }
  | { kind: "auth-status" }
  | { kind: "help"; topic?: "auth" | "mail" | "tokens" }
  | {
      accountId?: string;
      cursor?: string;
      kind: "mail-list";
      limit?: number;
    }
  | { kind: "mail-get"; threadId: string }
  | { days: number; kind: "tokens-create"; label: string; out: string }
  | { kind: "tokens-list" }
  | { credentialId: string; kind: "tokens-revoke" }
  | {
      accountId?: string;
      cursor?: string;
      kind: "mail-search";
      limit?: number;
      query: string;
    };

export function parseCommand(arguments_: string[]): Command {
  const normalized = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const [group, action, ...rest] = normalized;
  if (!group || group === "help" || group === "--help" || group === "-h") {
    return { kind: "help" };
  }
  if (group === "auth") return parseAuthCommand(action, rest);
  if (group === "accounts") return { kind: "accounts" };
  if (group === "mail") return parseMailCommand(action, rest);
  if (group === "tokens") return parseTokensCommand(action, rest);
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

const DEFAULT_TOKEN_LABEL = "Read-only mail reader";
const DEFAULT_TOKEN_DAYS = 90;

function parseTokensCommand(
  action: string | undefined,
  rest: string[],
): Command {
  if (!action || action === "help" || action === "--help") {
    return { kind: "help", topic: "tokens" };
  }
  if (action === "list") {
    assertNoArguments(rest, "tokens list");
    return { kind: "tokens-list" };
  }
  if (action === "revoke") {
    const [credentialId, ...extra] = rest;
    if (!credentialId) throw new Error("tokens revoke requires a token ID");
    assertNoArguments(extra, "tokens revoke");
    return { kind: "tokens-revoke", credentialId };
  }
  if (action === "create") return parseTokensCreate(rest);
  throw new Error(
    `Unknown tokens command: ${action}. Run \`freemail tokens help\`.`,
  );
}

function parseTokensCreate(values: string[]): Command {
  let days = DEFAULT_TOKEN_DAYS;
  let label = DEFAULT_TOKEN_LABEL;
  let out: string | undefined;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--out") {
      out = requiredOptionValue(values, ++index, value);
    } else if (value === "--label") {
      label = requiredOptionValue(values, ++index, value).trim();
    } else if (value === "--days") {
      days = Number(requiredOptionValue(values, ++index, value));
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        throw new Error("--days must be an integer between 1 and 90");
      }
    } else {
      throw new Error(`tokens create does not accept: ${value}`);
    }
  }
  if (!out) {
    throw new Error(
      "tokens create requires --out FILE: the token is written there, never printed",
    );
  }
  if (label.length < 1 || label.length > 80) {
    throw new Error("--label must be between 1 and 80 characters");
  }
  return { days, kind: "tokens-create", label, out };
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

function requiredOptionValue(values: string[], index: number, option: string) {
  const value = values[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function assertNoArguments(values: string[], command: string) {
  if (values.length > 0) {
    throw new Error(`${command} does not accept: ${values.join(" ")}`);
  }
}
