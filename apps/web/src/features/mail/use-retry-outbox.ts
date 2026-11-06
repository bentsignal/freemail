import { useMutation } from "convex/react";

import type { Id } from "@freemail/convex/model";
import { api } from "@freemail/convex/api";
import { toast } from "@freemail/ui-web/toast";

import { getErrorMessage } from "./live-data-utils";
import { markOutboxSending } from "./outbox-optimistic";

/** Retries a failed send; the row shows "Sending…" before the server answers. */
export function useRetryOutbox() {
  const retryOutbox = useMutation(
    api.mail.mutations.retryOutbox,
  ).withOptimisticUpdate(markOutboxSending);
  return (outboxId: Id<"outboxMessages">) => {
    retryOutbox({ outboxId }).catch((error: unknown) => {
      toast.error(getErrorMessage(error, "Could not retry this message."));
    });
  };
}
