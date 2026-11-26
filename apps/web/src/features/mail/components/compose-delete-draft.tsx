import { useState } from "react";
import { Trash2 } from "lucide-react";

import { isReplyDraftWorthKeeping } from "@freemail/features/mail";
import * as Dialog from "@freemail/ui-web/dialog";

import { useMailStore } from "../store";

/** A reply is saved as it's written; this throws it away, once confirmed. */
export function DeleteDraftButton() {
  const isReply = useMailStore((store) => store.composerReply !== undefined);
  const hasContent = useMailStore((store) =>
    isReplyDraftWorthKeeping(store.composerDraft),
  );
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isReply || !hasContent) return null;

  return (
    <>
      <button
        aria-label="Delete draft"
        className="mail-icon-button flex size-9 items-center justify-center rounded-full transition"
        onClick={() => setIsConfirming(true)}
        title="Delete draft"
        type="button"
      >
        <Trash2 className="size-4" />
      </button>
      <DeleteDraftDialog onOpenChange={setIsConfirming} open={isConfirming} />
    </>
  );
}

function DeleteDraftDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const deleteDraft = useMailStore((store) => store.deleteComposerDraft);

  return (
    <Dialog.Container onOpenChange={onOpenChange} open={open}>
      <Dialog.Content className="mail-dialog bg-background max-w-sm gap-0 overflow-hidden rounded-[18px] border p-0">
        <div className="border-b p-6">
          <Dialog.Title className="text-xl font-semibold tracking-tight">
            Delete this draft?
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-xs leading-5">
            This can’t be undone.
          </Dialog.Description>
        </div>
        <div className="flex justify-end gap-2 p-5">
          <button
            autoFocus
            className="bg-background border-border h-10 rounded-lg border px-4 text-xs font-semibold"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="bg-destructive text-destructive-foreground h-10 rounded-lg px-4 text-xs font-bold"
            onClick={() => {
              onOpenChange(false);
              deleteDraft();
            }}
            type="button"
          >
            Delete Draft
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Container>
  );
}
