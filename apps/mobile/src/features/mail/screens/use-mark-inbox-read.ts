import { Alert } from "react-native";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import type { MailAccountFilter } from "@freemail/features/mail";
import { api } from "@freemail/convex/api";

import type { MobileMailAccount } from "../lib/convex-mail";
import { optimisticallyMarkInboxRead } from "../inbox-read-optimistic";
import { toConvexId } from "../lib/convex-id";
import { getMarkAllReadMessage, getScopedUnreadCount } from "./mark-all-read";

/**
 * Mark All as Read for the inbox, after a confirmation. The count it
 * confirms is asked for once the inbox's live page is in and the server has
 * confirmed the session, so a cold open's first answer doesn't wait on it.
 */
export function useMarkInboxRead(
  accountFilter: MailAccountFilter,
  accounts: MobileMailAccount[],
  inboxIsLive: boolean,
) {
  const serverAuthenticated = useConvexAuth().isAuthenticated;
  const unreadCounts = useQuery(
    api.mail.queries.getUnreadCounts,
    inboxIsLive && serverAuthenticated ? {} : "skip",
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
