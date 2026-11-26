"use node";

import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { createImapClient } from "./client";
import type { ICloudMailboxCursor } from "./window";
import { internal } from "../../_generated/api";
import { createRemoteMessageId } from "./identifiers";
import {
  getCursorMessageStates,
  getTrackedReadStateChanges,
  initialTrackedUids,
  planIncrementalMailboxSync,
  planInitialMailboxSync,
  recentWindowCutoff,
  toUidSequence,
} from "./window";

const STORED_STATE_BATCH_SIZE = 100;

type ImapClient = ReturnType<typeof createImapClient>;

interface MessageState {
  mailbox: string;
  uidValidity: string;
  uid: number;
  remoteMessageId: string;
  isRead: boolean;
}

interface MailboxContext {
  ctx: ActionCtx;
  ownerId: string;
  accountId: Id<"mailAccounts">;
  client: ImapClient;
  mailbox: string;
  uidValidity: string;
  mailboxHighWaterUid: number;
}

/**
 * What a run does in one mailbox. `stored` is the read state the plan
 * compared against; `observed` collects what the server shows, for the
 * cursor this run saves.
 */
export async function planMailbox(
  mailbox: MailboxContext,
  previous: ICloudMailboxCursor | undefined,
  reason: "incremental" | "initial" | "manual" | "reconcile",
) {
  const observed = new Map<number, boolean>();
  if (previous?.uidValidity === mailbox.uidValidity) {
    // Scheduled runs compare the server with the cursor, not with storage;
    // a manual sync checks storage too, so a message lost locally comes back.
    const fromCursor =
      reason === "incremental" ? getCursorMessageStates(previous) : undefined;
    const stored = fromCursor
      ? fromCursor.map(({ uid, isRead }) => toState(mailbox, uid, isRead))
      : await readStoredStates(mailbox, previous.trackedUids);
    const plan = await createIncrementalPlan(
      mailbox,
      previous,
      stored,
      observed,
    );
    return { plan, stored, observed };
  }
  const found = await mailbox.client.search(
    { since: recentWindowCutoff(Date.now()) },
    { uid: true },
  );
  const recentUids = found === false ? [] : found;
  const stored = await readStoredStates(
    mailbox,
    initialTrackedUids(recentUids),
  );
  const plan = {
    ...planInitialMailboxSync({
      recentUids,
      importedUids: new Set(stored.map((item) => item.uid)),
      mailboxHighWaterUid: mailbox.mailboxHighWaterUid,
      uidValidity: mailbox.uidValidity,
    }),
    readStateChanges: new Array<{ remoteMessageId: string; isRead: boolean }>(),
  };
  return { plan, stored, observed };
}

function toState(mailbox: MailboxContext, uid: number, isRead: boolean) {
  return {
    mailbox: mailbox.mailbox,
    uidValidity: mailbox.uidValidity,
    uid,
    remoteMessageId: createRemoteMessageId(
      mailbox.mailbox,
      mailbox.uidValidity,
      uid,
    ),
    isRead,
  } satisfies MessageState;
}

/** Reads only the named messages, each by its index entry. */
async function readStoredStates(mailbox: MailboxContext, uids: number[]) {
  const candidates = uids.map((uid) => toState(mailbox, uid, false));
  const byRemoteId = new Map(
    candidates.map((item) => [item.remoteMessageId, item]),
  );
  const states = new Array<MessageState>();
  for (const batch of chunk(candidates, STORED_STATE_BATCH_SIZE)) {
    const found = await mailbox.ctx.runQuery(
      internal.sync.internal.getProviderMessageReadStates,
      {
        ownerId: mailbox.ownerId,
        accountId: mailbox.accountId,
        remoteMessageIds: batch.map((item) => item.remoteMessageId),
      },
    );
    for (const { remoteMessageId, isRead } of found) {
      const candidate = byRemoteId.get(remoteMessageId);
      if (candidate) states.push({ ...candidate, isRead });
    }
  }
  return states;
}

async function createIncrementalPlan(
  mailbox: MailboxContext,
  previous: ICloudMailboxCursor,
  imported: MessageState[],
  observed: Map<number, boolean>,
) {
  const trackedSequence = toUidSequence(previous.trackedUids);
  const observedTracked = new Array<{ uid: number; isRead: boolean }>();
  if (trackedSequence) {
    for await (const message of mailbox.client.fetch(
      trackedSequence,
      { uid: true, flags: true },
      { uid: true },
    )) {
      const isRead = message.flags?.has("\\Seen") ?? false;
      observedTracked.push({ uid: message.uid, isRead });
      observed.set(message.uid, isRead);
    }
  }
  const newUids =
    mailbox.mailboxHighWaterUid > previous.highWaterUid
      ? await mailbox.client.search(
          { uid: `${previous.highWaterUid + 1}:*` },
          { uid: true },
        )
      : [];
  return {
    ...planIncrementalMailboxSync({
      cursor: previous,
      existingTrackedUids: observedTracked.map((item) => item.uid),
      imported,
      mailboxHighWaterUid: mailbox.mailboxHighWaterUid,
      newUids: newUids === false ? [] : newUids,
    }),
    readStateChanges: getTrackedReadStateChanges({
      cursor: previous,
      imported,
      observed: observedTracked,
    }),
  };
}

export function chunk<T>(values: T[], size: number) {
  const batches = new Array<T[]>();
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}
