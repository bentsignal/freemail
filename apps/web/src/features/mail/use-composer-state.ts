import { useEffect, useRef, useState } from "react";

import type { Id } from "@freemail/convex/model";
import type {
  ComposerAttachment,
  ComposerDraft,
} from "@freemail/features/mail";

import {
  deleteReplyDraft,
  readReplyDraft,
  saveReplyDraft,
  useReplyDraftEditVersion,
} from "./reply-drafts";

/** The thread a reply answers, and who it's to, for its title. */
export interface ComposerReply {
  messageId: Id<"messages">;
  name: string;
  threadId: Id<"threads">;
}

interface ComposerValues {
  accountId: Id<"mailAccounts"> | undefined;
  draft: ComposerDraft;
  reply: ComposerReply | undefined;
}

export interface ComposerSnapshot {
  accountId: Id<"mailAccounts">;
  draft: ComposerDraft;
  idempotencyKey: string;
  reply: ComposerReply | undefined;
}

interface ReplyTarget extends ComposerReply {
  accountId: Id<"mailAccounts">;
  address: string;
  subject: string;
}

function createEmptyDraft() {
  return {
    attachments: [],
    bcc: "",
    body: "",
    cc: "",
    subject: "",
    to: "",
  } satisfies ComposerDraft;
}

function createIdempotencyKey() {
  return `freemail-web-${crypto.randomUUID()}`;
}

/**
 * The composer's message, sender, and the thread it replies to. A reply is
 * kept as it's written (reply-drafts.ts), so closing it to reread the
 * thread and pressing Reply again picks it back up; sending deletes it.
 */
export function useComposerState() {
  const [composerIsOpen, setComposerIsOpen] = useState(false);
  const { changes, update, values } = useComposerValues();
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const composerCanSend =
    values.draft.to.trim().length > 0 && values.draft.body.trim().length > 0;

  function openReply({ accountId, address, subject, ...reply }: ReplyTarget) {
    const saved = readReplyDraft(reply.threadId);
    update({
      accountId: saved?.accountId ?? accountId,
      draft: saved?.draft ?? {
        ...createEmptyDraft(),
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        to: address,
      },
      reply,
    });
    setComposerIsOpen(true);
    setIdempotencyKey(createIdempotencyKey());
  }

  function startOver() {
    update({ draft: createEmptyDraft(), reply: undefined });
    if (values.reply) deleteReplyDraft(values.reply.threadId);
    setIdempotencyKey(createIdempotencyKey());
  }

  /** Reopens a message whose send failed, as it was when Send was pressed. */
  function restoreComposer({ idempotencyKey: key, ...rest }: ComposerSnapshot) {
    update(rest);
    setIdempotencyKey(key);
    setComposerIsOpen(true);
  }

  return {
    ...changes,
    completeComposerEnqueue: () => {
      if (!composerCanSend) return;
      setComposerIsOpen(false);
      startOver();
    },
    closeComposer: () => setComposerIsOpen(false),
    composerCanSend,
    composerAccountId: values.accountId,
    composerDraft: values.draft,
    composerIsOpen,
    composerReply: values.reply,
    deleteComposerDraft: () => {
      setComposerIsOpen(false);
      startOver();
    },
    idempotencyKey,
    openComposer: () => {
      update({ draft: createEmptyDraft(), reply: undefined });
      setIdempotencyKey(createIdempotencyKey());
      setComposerIsOpen(true);
    },
    openReply,
    restoreComposer,
  };
}

function useComposerValues() {
  const [values, setValues] = useState<ComposerValues>(() => ({
    accountId: undefined,
    draft: createEmptyDraft(),
    reply: undefined,
  }));
  // The newest values, for updates that arrive between renders (uploads).
  const latest = useRef(values);
  const editVersion = useReplyDraftEditVersion(values.reply?.threadId);

  // eslint-disable-next-line no-restricted-syntax -- Another device's edit to the open reply arrives through the drafts store outside React, and replaces what the composer shows.
  useEffect(() => {
    const current = latest.current;
    const saved = current.reply && readReplyDraft(current.reply.threadId);
    if (!saved) return;
    const next = {
      ...current,
      accountId: saved.accountId ?? current.accountId,
      draft: saved.draft,
    };
    latest.current = next;
    setValues(next);
  }, [editVersion]);

  function update(next: Partial<ComposerValues>) {
    const merged = { ...latest.current, ...next };
    latest.current = merged;
    setValues(merged);
    if (merged.reply) {
      saveReplyDraft(merged.reply.threadId, merged.draft, merged.accountId);
    }
  }

  function updateDraft(change: (draft: ComposerDraft) => ComposerDraft) {
    update({ draft: change(latest.current.draft) });
  }

  const changes = {
    addComposerAttachments: (attachments: ComposerAttachment[]) =>
      updateDraft((draft) => ({
        ...draft,
        attachments: [...draft.attachments, ...attachments],
      })),
    removeComposerAttachment: (attachmentId: string) =>
      updateDraft((draft) => ({
        ...draft,
        attachments: draft.attachments.filter(
          (attachment) => attachment.id !== attachmentId,
        ),
      })),
    setComposerAccountId: (accountId: Id<"mailAccounts">) =>
      update({ accountId }),
    updateComposerAttachment: (
      attachmentId: string,
      change: Partial<ComposerAttachment>,
    ) =>
      updateDraft((draft) => ({
        ...draft,
        attachments: draft.attachments.map((attachment) =>
          attachment.id === attachmentId
            ? { ...attachment, ...change }
            : attachment,
        ),
      })),
    updateComposerDraft: (
      field: "bcc" | "body" | "cc" | "subject" | "to",
      value: string,
    ) => updateDraft((draft) => ({ ...draft, [field]: value })),
  };

  return { changes, update, values };
}
