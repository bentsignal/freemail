/* eslint-disable @typescript-eslint/consistent-type-assertions -- Draft IDs round-trip from the server's own draft list. */
/* eslint-disable no-restricted-imports -- The drafts list is subscribed to for as long as the mail is open, not preloaded for one route. */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";

import type { Id } from "@freemail/convex/model";
import { api } from "@freemail/convex/api";

import { applyServerReplyDrafts, connectReplyDrafts } from "../reply-drafts";

/**
 * Keeps this browser's reply drafts in step with the server's, so a reply
 * started here can be finished on another device. Draws nothing.
 */
export function ReplyDraftSync() {
  const { data: rows } = useQuery({
    ...convexQuery(api.replyDrafts.queries.list, {}),
    select: (drafts) => drafts,
  });
  const save = useMutation(api.replyDrafts.mutations.save);
  const remove = useMutation(api.replyDrafts.mutations.remove);

  // eslint-disable-next-line no-restricted-syntax -- The drafts live in a store outside React (reply-drafts.ts); this hands it each new server copy.
  useEffect(() => {
    if (rows) applyServerReplyDrafts(rows);
  }, [rows]);

  // eslint-disable-next-line no-restricted-syntax -- Lets that store send edits while the mail is open, and stops it after.
  useEffect(() => {
    connectReplyDrafts({
      remove: ({ deletedAt, threadId }) =>
        remove({ deletedAt, threadId: threadId as Id<"threads"> }),
      save: (draft) =>
        save({
          ...draft,
          accountId: draft.accountId as Id<"mailAccounts"> | undefined,
          attachmentIds: draft.attachmentIds as Id<"draftAttachments">[],
          threadId: draft.threadId as Id<"threads">,
        }),
    });
    return () => connectReplyDrafts(undefined);
  }, [remove, save]);

  return null;
}
