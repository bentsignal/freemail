import { PencilLine, Reply } from "lucide-react";

import type { ThreadMessageDetail } from "../types";
import { useReplyDraft } from "../reply-drafts";

/** The thread's unsent reply when there is one, otherwise a Reply button. */
export function ReaderReply({
  onReply,
  selectedMessage,
  threadId,
}: {
  onReply: () => void;
  selectedMessage: ThreadMessageDetail | undefined;
  threadId: string;
}) {
  const draft = useReplyDraft(threadId);

  if (draft) {
    return (
      <button
        className="bg-background hover:bg-accent mt-10 flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition"
        onClick={onReply}
        type="button"
      >
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <PencilLine className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-destructive block text-sm font-semibold">
            Draft
          </span>
          <span className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-line">
            {draft.body.trim()}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      className="bg-background text-foreground hover:bg-accent mt-10 flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition"
      onClick={onReply}
      type="button"
    >
      <Reply className="size-4" />
      Reply to {getSenderFirstName(selectedMessage)}
    </button>
  );
}

function getSenderFirstName(message: ThreadMessageDetail | undefined) {
  if (!message) return "sender";
  const sender = getAddressName(message.from);
  return sender.split(/[\s@]/)[0];
}

function getAddressName(address: ThreadMessageDetail["from"]) {
  const name = address.name?.trim();
  if (name) return name;
  return address.address;
}
