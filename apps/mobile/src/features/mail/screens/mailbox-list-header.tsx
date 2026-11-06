import { Text } from "react-native";

import type { MailAccountFilter } from "@rodge-mail/features/mail";

import type { MobileMailAccount } from "../lib/convex-mail";
import { InboxSyncStatus } from "./inbox-sync-status";
import { getSelectedAccountLabel } from "./mailbox-scope";

export function ListHeader({
  accountFilter,
  accounts,
  refreshError,
  searchMode,
}: {
  accountFilter: MailAccountFilter;
  accounts: MobileMailAccount[];
  refreshError: string | undefined;
  searchMode: boolean;
}) {
  if (searchMode) return null;
  return (
    <>
      <SelectedAccountLabel accountFilter={accountFilter} accounts={accounts} />
      <InboxSyncStatus accounts={accounts} error={refreshError} />
    </>
  );
}

/** Which account the large title above it is for. */
export function SelectedAccountLabel({
  accountFilter,
  accounts,
}: {
  accountFilter: string;
  accounts: MobileMailAccount[];
}) {
  const label = getSelectedAccountLabel(accountFilter, accounts);
  if (!label) return null;
  return (
    <Text
      className="text-muted-foreground px-4 pb-2 text-[15px]"
      numberOfLines={1}
      testID="mailbox-selected-account"
    >
      {label}
    </Text>
  );
}
