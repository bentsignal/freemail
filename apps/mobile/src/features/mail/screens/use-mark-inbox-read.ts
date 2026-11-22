import { Alert } from "react-native";
import { useMutation, useQuery } from "convex/react";

import type { MailAccountFilter } from "@freemail/features/mail";
import { api } from "@freemail/convex/api";

import type { MobileMailAccount } from "../lib/convex-mail";
import { optimisticallyMarkInboxRead } from "../inbox-read-optimistic";
import { toConvexId } from "../lib/convex-id";
import { getMarkAllReadMessage, getScopedUnreadCount } from "./mark-all-read";

/**
 * Mark All as Read for the inbox, after a confirmation. The count it
 * confirms is asked for once the inbox's live page is in, so a cold open's
 * first answer from the server doesn't wait on it.
 */
export function useMarkInboxRead(
  accountFilter: MailAccountFilter,
  accounts: MobileMailAccount[],
  inboxIsLive: boolean,
) {
  const unreadCounts = useQuery(
    api.mail.queries.getUnreadCounts,
    inboxIsLive ? {} : "skip",
  );
  const markInboxRead = useMutation(
    api.mail.inboxRead.markInboxRead,
  ).withOptimisticUpdate(optimisticallyMarkInboxRead);
  const unreadCount = getScopedUnreadCount(unreadCounts, accountFilter);

  function markAllRead() {
    markInboxRead({
      accountId:
        accountFilter === "all"
          ? undefined
          : toConvexId<"mailAccounts">(accountFilter),
    }).catch(() =>
      Alert.alert("Couldn't Mark All as Read", "Try again in a moment."),
    );
  }

  function confirmMarkAllRead() {
    if (unreadCount === 0) {
      Alert.alert("No Unread Conversations");
      return;
    }
    Alert.alert(
      "Mark All as Read?",
      getMarkAllReadMessage(unreadCount, accountFilter, accounts),
      [
        { style: "cancel", text: "Cancel" },
        { onPress: markAllRead, text: "Mark All Read" },
      ],
    );
  }

  return confirmMarkAllRead;
}
