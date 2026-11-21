import { useState } from "react";

import type { MailThread } from "@freemail/features/mail";

import type { MailboxFilter } from "./mailbox-controls";
import type { MailboxBulkAction } from "./mailbox-thread-list";
import { useMailStore } from "../store";
import { filterMailboxThreads } from "./mailbox-controls";

export function useInboxMailboxControls(threads: MailThread[]) {
  const archiveThread = useMailStore((store) => store.archiveThread);
  const toggleRead = useMailStore((store) => store.toggleRead);
  const [filter, setFilter] = useState<MailboxFilter>("all");
  const selectionMode = useMailStore((store) => store.selectionMode);
  const setSelectionMode = useMailStore((store) => store.setSelectionMode);
  const selectedIds = useMailStore((store) => store.selectedThreadIds);
  const clearThreadSelection = useMailStore(
    (store) => store.clearThreadSelection,
  );
  const [retainedUnreadIds, setRetainedUnreadIds] = useState(
    () => new Set<string>(),
  );

  function toggleSelectionMode() {
    setSelectionMode((current) => !current);
    clearThreadSelection();
  }
  function changeFilter(nextFilter: MailboxFilter) {
    setFilter(nextFilter);
    clearThreadSelection();
    setRetainedUnreadIds(new Set());
  }
  function retainThreadInUnreadSession(threadId: string) {
    if (filter !== "unread") return;
    setRetainedUnreadIds((current) => new Set(current).add(threadId));
  }
  function getSelectedThreads() {
    return threads.filter((thread) => selectedIds.has(thread.id));
  }
  function archiveSelected() {
    const selectedThreads = getSelectedThreads();
    toggleSelectionMode();
    for (const thread of selectedThreads) {
      if ((thread.location?.kind ?? "inbox") === "inbox") {
        void archiveThread(thread.id);
      }
    }
  }
  function setSelectedRead(isRead: boolean) {
    const selectedThreads = getSelectedThreads();
    if (isRead && filter === "unread") {
      setRetainedUnreadIds(
        (current) =>
          new Set([...current, ...selectedThreads.map((thread) => thread.id)]),
      );
    }
    toggleSelectionMode();
    for (const thread of selectedThreads) {
      if (thread.isRead !== isRead) void toggleRead(thread.id, thread.isRead);
    }
  }

  const bulkActions = [
    {
      label: "Archive",
      systemImage: "archivebox",
      onPress: archiveSelected,
    },
    {
      label: "Mark read",
      systemImage: "envelope.open",
      onPress: () => setSelectedRead(true),
    },
    {
      label: "Mark unread",
      systemImage: "envelope.badge",
      onPress: () => setSelectedRead(false),
    },
  ] satisfies MailboxBulkAction[];
  return {
    bulkActions,
    changeFilter,
    filter,
    selectedCount: selectedIds.size,
    selectedIds,
    selectionMode,
    retainThreadInUnreadSession,
    threads: filterMailboxThreads(threads, filter, retainedUnreadIds),
    toggleSelectionMode,
  };
}
