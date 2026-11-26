import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import { api } from "@freemail/convex/api";

import { useInboxIsLive } from "./inbox-live";
import { toConvexId } from "./lib/convex-id";
import { applyServerReplyDrafts, connectReplyDrafts } from "./reply-drafts";

/**
 * Keeps this device's reply drafts in step with the server's, so a reply
 * started here can be finished on another device. Draws nothing; it waits
 * for the inbox, like the other queries that don't draw it.
 */
export function ReplyDraftSync() {
  const serverAuthenticated = useConvexAuth().isAuthenticated;
  const inboxIsLive = useInboxIsLive();
  const enabled = serverAuthenticated && inboxIsLive;
  const rows = useQuery(api.replyDrafts.queries.list, enabled ? {} : "skip");
  const save = useMutation(api.replyDrafts.mutations.save);
  const remove = useMutation(api.replyDrafts.mutations.remove);

  // eslint-disable-next-line no-restricted-syntax -- The drafts live in a store outside React (reply-drafts.ts); this hands it each new server copy.
  useEffect(() => {
    if (rows) applyServerReplyDrafts(rows);
  }, [rows]);

  // eslint-disable-next-line no-restricted-syntax -- Lets that store send edits while the server has the session, and stops it after.
  useEffect(() => {
    if (!enabled) return;
    connectReplyDrafts({
      remove: ({ deletedAt, threadId }) =>
        remove({ deletedAt, threadId: toConvexId<"threads">(threadId) }),
      save: (draft) =>
        save({
          ...draft,
          accountId: draft.accountId
            ? toConvexId<"mailAccounts">(draft.accountId)
            : undefined,
          attachmentIds: draft.attachmentIds.map((id) =>
            toConvexId<"draftAttachments">(id),
          ),
          threadId: toConvexId<"threads">(draft.threadId),
        }),
    });
    return () => connectReplyDrafts(undefined);
  }, [enabled, remove, save]);

  return null;
}
