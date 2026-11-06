import type { MailAccountFilter } from "@freemail/features/mail";

import type { MobileMailAccount } from "../lib/convex-mail";
import type { NativeComposerAttachment } from "./use-native-attachments";

export type ComposerFieldName = "bcc" | "body" | "cc" | "subject" | "to";

export function createComposerDraft({
  bcc,
  body,
  cc,
  subject,
  to,
}: {
  bcc?: string;
  body?: string;
  cc?: string;
  subject?: string;
  to?: string;
}) {
  return {
    attachments: new Array<NativeComposerAttachment>(),
    bcc: bcc ?? "",
    body: body ?? "",
    cc: cc ?? "",
    subject: subject ?? "",
    to: to ?? "",
  };
}

export function getSelectedAccount(
  accounts: MobileMailAccount[],
  selectedAccountId: string | undefined,
  accountFilter: MailAccountFilter,
) {
  return (
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts.find((account) => account.id === accountFilter) ??
    accounts[0]
  );
}

export function canSendFromAccount(account: MobileMailAccount) {
  return (
    ["gmail", "hosted", "icloud", "microsoft"].includes(account.provider) &&
    ["connected", "syncing"].includes(account.status)
  );
}

export function draftCanSend(draft: {
  attachments: NativeComposerAttachment[];
  body: string;
  to: string;
}) {
  return (
    draft.to.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    draft.attachments.every((attachment) => attachment.status === "ready")
  );
}
