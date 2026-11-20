import { useState } from "react";
import { useMutation } from "convex/react";
import { CheckCheck } from "lucide-react";

import { api } from "@freemail/convex/api";
import * as Dialog from "@freemail/ui-web/dialog";
import { toast } from "@freemail/ui-web/toast";

import type { MailAccountView } from "../types";
import { optimisticallyMarkInboxRead } from "../inbox-read-optimistic";
import { useLiveMail } from "../live-data";
import { getErrorMessage } from "../live-data-utils";
import { useMailStore } from "../store";

export function MarkAllReadButton() {
  const bulkSelectionIsActive = useMailStore(
    (store) => store.bulkSelectionIsActive,
  );
  if (bulkSelectionIsActive) return null;
  return <MarkAllReadDialog />;
}

function MarkAllReadDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const accountFilter = useMailStore((store) => store.accountFilter);
  const { accounts, unreadCounts } = useLiveMail();
  const markInboxRead = useMutation(
    api.mail.inboxRead.markInboxRead,
  ).withOptimisticUpdate(optimisticallyMarkInboxRead);
  const unreadCount = unreadCounts[accountFilter] ?? 0;

  function markAllRead() {
    setIsOpen(false);
    markInboxRead({
      accountId: accountFilter === "all" ? undefined : accountFilter,
    }).catch((error: unknown) =>
      toast.error(getErrorMessage(error, "Could not mark the inbox read.")),
    );
  }

  return (
    <Dialog.Container onOpenChange={setIsOpen} open={isOpen}>
      <Dialog.Trigger asChild>
        <button
          aria-label="Mark all as read"
          className="focus-visible:outline-ring bg-background hover:text-foreground border-border text-muted-foreground flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[11px] font-semibold tracking-wide transition-[background-color,border-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={unreadCount === 0}
          title="Mark all as read"
          type="button"
        >
          <CheckCheck
            aria-hidden="true"
            className="size-3.5"
            strokeWidth={1.8}
          />
          <span className="hidden sm:inline">Read all</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Content className="mail-dialog bg-background max-w-md overflow-hidden rounded-[18px] border p-0">
        <div className="border-b p-6">
          <Dialog.Title className="text-2xl font-semibold tracking-tight">
            Mark all as read?
          </Dialog.Title>
          <Dialog.Description className="text-muted-foreground mt-2 text-xs leading-5">
            {getMarkAllReadMessage(unreadCount, accountFilter, accounts)}
          </Dialog.Description>
        </div>
        <div className="flex justify-end gap-2 p-5">
          <button
            className="bg-background border-border h-10 rounded-lg border px-4 text-xs font-semibold"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="bg-primary text-primary-foreground h-10 rounded-lg px-4 text-xs font-bold"
            onClick={markAllRead}
            type="button"
          >
            Mark all read
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Container>
  );
}

export function getMarkAllReadMessage(
  count: number,
  accountFilter: string,
  accounts: Pick<MailAccountView, "_id" | "address">[],
) {
  const conversations = `${count} unread conversation${count === 1 ? "" : "s"}`;
  const account = accounts.find((candidate) => candidate._id === accountFilter);
  if (!account) return `${conversations} in your inbox.`;
  return `${conversations} in ${account.address}.`;
}
