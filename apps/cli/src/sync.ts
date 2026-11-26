/* eslint-disable no-restricted-syntax -- The sync loop threads one deadline and clock through small helpers. */
import type {
  AgentMailAccount,
  SearchMailOutput,
} from "@freemail/agent-contract";

export interface SyncOptions {
  accountId?: string;
  sinceMinutes: number;
  timeoutSeconds: number;
  waitFor?: string;
}

export interface SyncClient {
  listAccounts: () => Promise<{ accounts: AgentMailAccount[] }>;
  listMail: (args: {
    accountId?: string;
    limit?: number;
  }) => Promise<SearchMailOutput | null>;
  searchMail: (
    query: string,
    args: { accountId?: string; limit?: number },
  ) => Promise<SearchMailOutput | null>;
  syncAccount: (account: AgentMailAccount) => Promise<void>;
  syncAll: () => Promise<void>;
}

interface SyncDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const POLL_MS = 1000;
const RETRIGGER_MS = 5000;
const FAILED_STATUSES = new Set(["error", "reauthorization_required"]);

const defaultDeps: SyncDeps = {
  now: () => Date.now(),
  sleep: async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function syncMail(
  client: SyncClient,
  options: SyncOptions,
  deps: SyncDeps = defaultDeps,
) {
  const startedAt = deps.now();
  const deadline = startedAt + options.timeoutSeconds * 1000;
  const { accounts } = await client.listAccounts();
  const targets = accounts.filter(
    (account) =>
      (!options.accountId || account.id === options.accountId) &&
      account.provider !== "hosted" &&
      account.status !== "disconnected",
  );
  if (options.accountId && !accounts.some((a) => a.id === options.accountId)) {
    throw new Error(`No connected account with ID ${options.accountId}`);
  }
  const before = new Set(
    (await newestMessages(client, options.accountId)).map((m) => m.messageId),
  );

  if (options.waitFor !== undefined) {
    return await waitFor(client, options, targets, deps, startedAt, deadline);
  }

  await trigger(client, options, targets);
  const result = await waitForSync(client, targets, deps, startedAt, deadline);
  const arrived = (await newestMessages(client, options.accountId)).filter(
    (message) => !before.has(message.messageId),
  );
  return {
    ...result,
    arrived,
    elapsedMs: deps.now() - startedAt,
  };
}

async function waitFor(
  client: SyncClient,
  options: SyncOptions & { waitFor?: string },
  targets: AgentMailAccount[],
  deps: SyncDeps,
  startedAt: number,
  deadline: number,
) {
  const query = (options.waitFor ?? "").trim();
  if (query.length < 2)
    throw new Error("--wait-for needs at least 2 characters");
  const since = startedAt - options.sinceMinutes * 60 * 1000;
  let syncs = 0;
  let lastSync: Awaited<ReturnType<typeof waitForSync>> | undefined;
  for (;;) {
    const matches = await findMatches(client, query, options.accountId, since);
    if (matches.length > 0) {
      return {
        found: true,
        timedOut: false,
        query,
        messages: matches,
        syncs,
        elapsedMs: deps.now() - startedAt,
      };
    }
    if (deps.now() >= deadline) {
      return {
        found: false,
        timedOut: true,
        query,
        messages: [],
        syncs,
        ...(lastSync?.failed.length ? { failed: lastSync.failed } : {}),
        elapsedMs: deps.now() - startedAt,
      };
    }
    const cycleStartedAt = deps.now();
    await trigger(client, options, targets);
    syncs += 1;
    lastSync = await waitForSync(
      client,
      targets,
      deps,
      cycleStartedAt,
      Math.min(deadline, cycleStartedAt + 30_000),
    );
    const rest = RETRIGGER_MS - (deps.now() - cycleStartedAt);
    if (rest > 0 && deps.now() + rest < deadline) await deps.sleep(rest);
  }
}

async function trigger(
  client: SyncClient,
  options: SyncOptions,
  targets: AgentMailAccount[],
) {
  if (options.accountId) {
    for (const account of targets) await client.syncAccount(account);
    return;
  }
  if (targets.length > 0) await client.syncAll();
}

async function waitForSync(
  client: SyncClient,
  targets: AgentMailAccount[],
  deps: SyncDeps,
  startedAt: number,
  deadline: number,
) {
  const pending = new Set(targets.map((account) => account.id));
  const failed: { accountId: string; address: string; status: string }[] = [];
  let latest = targets;
  while (pending.size > 0 && deps.now() < deadline) {
    await deps.sleep(POLL_MS);
    latest = (await client.listAccounts()).accounts;
    for (const account of latest) {
      if (!pending.has(account.id)) continue;
      if ((account.lastSyncedAt ?? 0) >= startedAt) {
        pending.delete(account.id);
      } else if (
        FAILED_STATUSES.has(account.status) &&
        deps.now() - startedAt >= 10_000
      ) {
        pending.delete(account.id);
        failed.push({
          accountId: account.id,
          address: account.address,
          status: account.status,
        });
      }
    }
  }
  const byId = new Map(latest.map((account) => [account.id, account]));
  return {
    accounts: targets.map((target) => {
      const account = byId.get(target.id) ?? target;
      return {
        accountId: account.id,
        address: account.address,
        provider: account.provider,
        status: account.status,
        lastSyncedAt: account.lastSyncedAt,
        synced: (account.lastSyncedAt ?? 0) >= startedAt,
      };
    }),
    failed,
    timedOut: pending.size > 0,
  };
}

async function newestMessages(client: SyncClient, accountId?: string) {
  const page = await client.listMail({
    ...(accountId ? { accountId } : {}),
    limit: 25,
  });
  return page?.messages ?? [];
}

async function findMatches(
  client: SyncClient,
  query: string,
  accountId: string | undefined,
  since: number,
) {
  const [searched, newest] = await Promise.all([
    client
      .searchMail(query, { ...(accountId ? { accountId } : {}), limit: 10 })
      .then((page) => page?.messages ?? []),
    newestMessages(client, accountId),
  ]);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const local = newest.filter((message) => {
    const haystack = [
      message.subject,
      message.snippet,
      JSON.stringify(message.from),
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const seen = new Set<string>();
  return [...local, ...searched]
    .filter((message) => message.receivedAt >= since)
    .filter((message) => {
      if (seen.has(message.messageId)) return false;
      seen.add(message.messageId);
      return true;
    })
    .sort((a, b) => b.receivedAt - a.receivedAt);
}
