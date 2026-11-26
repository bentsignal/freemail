/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { getVisibleUnreadInboxThreads } from "./queryEnrichment";
import { getUnreadCountSummary } from "./unreadCounts";

vi.mock("../convex.env", () => ({
  env: { AUTH_ALLOWED_USER_ID: "owner" },
}));

const modules = import.meta.glob("/src/**/*.ts");
const OWNER = "owner";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const t = convexTest(schema, modules);
  return { t, owner: t.withIdentity({ subject: OWNER }) };
}

type TestConvex = ReturnType<typeof setup>["t"];

async function insertAccount(ctx: MutationCtx, address: string) {
  return await ctx.db.insert("mailAccounts", {
    ownerId: OWNER,
    provider: "hosted",
    remoteAccountId: address,
    address,
    status: "connected",
    createdAt: 1,
    updatedAt: 1,
  });
}

async function insertThread(
  ctx: MutationCtx,
  accountId: Id<"mailAccounts">,
  subject: string,
  { inInbox = true, isSpam = false }: { inInbox?: boolean; isSpam?: boolean },
) {
  const at = 100;
  const threadId = await ctx.db.insert("threads", {
    ownerId: OWNER,
    accountId,
    remoteThreadId: subject,
    subject,
    snippet: subject,
    participants: [],
    latestMessageAt: at,
    latestInboxMessageAt: inInbox ? at : undefined,
    messageCount: 1,
    unreadCount: 1,
    inInbox,
    isPinned: false,
    hasAttachments: false,
    createdAt: at,
    updatedAt: at,
  });
  const messageId = await ctx.db.insert("messages", {
    ownerId: OWNER,
    accountId,
    threadId,
    remoteMessageId: subject,
    direction: "incoming",
    from: { address: "sender@example.com" },
    to: [],
    cc: [],
    bcc: [],
    subject,
    snippet: subject,
    searchText: subject,
    remoteLabelIds: [],
    bodyState: "available",
    receivedAt: at,
    hasAttachments: false,
    inInbox,
    isRead: false,
    isPinned: false,
    createdAt: at,
    updatedAt: at,
  });
  await ctx.db.insert("messageClassifications", {
    ownerId: OWNER,
    messageId,
    status: "classified",
    category: "noise",
    importance: 0,
    confidence: 1,
    reason: "seed",
    summary: subject,
    shouldEmbed: false,
    isSpam,
    source: "seed",
    promptVersion: "test",
    createdAt: at,
    updatedAt: at,
  });
  return { threadId, messageId };
}

async function seed(t: TestConvex) {
  return await t.run(async (ctx) => {
    const first = await insertAccount(ctx, "first@example.com");
    const second = await insertAccount(ctx, "second@example.com");
    return {
      first,
      second,
      one: await insertThread(ctx, first, "one", {}),
      two: await insertThread(ctx, first, "two", {}),
      three: await insertThread(ctx, second, "three", {}),
      archived: await insertThread(ctx, first, "archived", { inInbox: false }),
      spam: await insertThread(ctx, second, "spam", { isSpam: true }),
    };
  });
}

async function backfill(t: TestConvex) {
  await t.mutation(internal.mail.inboxUnreadBackfill.backfill, {});
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
}

async function scannedCounts(t: TestConvex) {
  return await t.run(async (ctx) =>
    getUnreadCountSummary(await getVisibleUnreadInboxThreads(ctx, OWNER)),
  );
}

async function expectCountsMatchScan(
  t: TestConvex,
  owner: ReturnType<typeof setup>["owner"],
  expected: { all: number; byAccount: Record<string, number> },
) {
  expect(await scannedCounts(t)).toEqual(expected);
  expect(await owner.query(api.mail.queries.getUnreadCounts, {})).toEqual(
    expected,
  );
}

it("reads counters only after the backfill marks them ready", async () => {
  const { t, owner } = setup();
  const { first, second } = await seed(t);

  await expect(
    t.run(async (ctx) => await ctx.db.query("inboxUnreadCounts").collect()),
  ).resolves.toEqual([]);
  await expectCountsMatchScan(t, owner, {
    all: 3,
    byAccount: { [first]: 2, [second]: 1 },
  });

  await backfill(t);

  const counts = await t.run(
    async (ctx) => await ctx.db.query("inboxUnreadCounts").unique(),
  );
  expect(counts?.readyAt).toBeTypeOf("number");
  expect(counts?.byAccount).toEqual({ [first]: 2, [second]: 1 });
  await expectCountsMatchScan(t, owner, {
    all: 3,
    byAccount: { [first]: 2, [second]: 1 },
  });
});

it("keeps the counters in step with reads, spam, archive, and inbox moves", async () => {
  const { t, owner } = setup();
  const { first, second, one, two, three, archived, spam } = await seed(t);
  await backfill(t);

  await owner.mutation(api.mail.mutations.setThreadRead, {
    threadId: one.threadId,
    isRead: true,
  });
  await expectCountsMatchScan(t, owner, {
    all: 2,
    byAccount: { [first]: 1, [second]: 1 },
  });

  await owner.mutation(api.classification.mutations.setSpamState, {
    messageId: three.messageId,
    isSpam: true,
  });
  await expectCountsMatchScan(t, owner, { all: 1, byAccount: { [first]: 1 } });

  await owner.mutation(api.classification.mutations.setSpamState, {
    messageId: spam.messageId,
    isSpam: false,
  });
  await expectCountsMatchScan(t, owner, {
    all: 2,
    byAccount: { [first]: 1, [second]: 1 },
  });

  await owner.mutation(api.mail.mutations.archiveThread, {
    threadId: two.threadId,
  });
  await expectCountsMatchScan(t, owner, { all: 1, byAccount: { [second]: 1 } });

  await owner.mutation(api.mail.archiveMutations.moveThreadToInbox, {
    threadId: archived.threadId,
  });
  await expectCountsMatchScan(t, owner, {
    all: 2,
    byAccount: { [first]: 1, [second]: 1 },
  });

  await owner.mutation(api.mail.mutations.setRead, {
    messageId: one.messageId,
    isRead: false,
  });
  await expectCountsMatchScan(t, owner, {
    all: 3,
    byAccount: { [first]: 2, [second]: 1 },
  });

  await expect(
    owner.mutation(api.mail.inboxRead.markInboxRead, {}),
  ).resolves.toEqual({ threads: 3 });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await expectCountsMatchScan(t, owner, { all: 0, byAccount: {} });
  await expect(
    t.run(async (ctx) => await ctx.db.query("inboxUnreadThreads").collect()),
  ).resolves.toEqual([]);
});

it("leaves out an account being removed and repairs drift on a rerun", async () => {
  const { t, owner } = setup();
  const { first, second, three } = await seed(t);
  await backfill(t);

  await t.run(async (ctx) => {
    await ctx.db.patch(second, { deletingAt: 5 });
  });
  await expect(
    owner.query(api.mail.queries.getUnreadCounts, {}),
  ).resolves.toEqual({ all: 2, byAccount: { [first]: 2 } });

  await t.run(async (ctx) => {
    await ctx.db.patch(second, { deletingAt: undefined });
    // A write that skipped the triggers.
    await ctx.db.patch(three.threadId, { unreadCount: 0 });
  });
  await expect(
    owner.query(api.mail.queries.getUnreadCounts, {}),
  ).resolves.toEqual({ all: 3, byAccount: { [first]: 2, [second]: 1 } });

  await backfill(t);
  await expectCountsMatchScan(t, owner, { all: 2, byAccount: { [first]: 2 } });
});
