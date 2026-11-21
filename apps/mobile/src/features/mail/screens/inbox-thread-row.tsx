import type { MailThread } from "@freemail/features/mail";

import { ThreadRow } from "../components/thread-row";
import { getThreadTag } from "../components/thread-row-presentation";
import { useMailStore } from "../store";

/**
 * Reads its own selection from the store, so selecting a row or switching
 * Select mode re-renders the rows that change without re-rendering the list.
 */
export function InboxThreadRow({
  isSearch,
  onMoveToInbox,
  onOpen,
  thread,
}: {
  isSearch: boolean;
  onMoveToInbox: (threadId: string) => void;
  onOpen: (thread: MailThread) => void;
  thread: MailThread;
}) {
  const accounts = useMailStore((store) => store.accounts);
  const accountFilter = useMailStore((store) => store.accountFilter);
  const selectionMode = useMailStore((store) => store.selectionMode);
  const selected = useMailStore((store) =>
    store.selectedThreadIds.has(thread.id),
  );
  const toggleThreadSelected = useMailStore(
    (store) => store.toggleThreadSelected,
  );
  return (
    <ThreadRow
      locationTag={
        isSearch
          ? getThreadTag({ accountFilter, accounts, isSearch, thread })
          : undefined
      }
      onMoveToInbox={() => onMoveToInbox(thread.id)}
      selected={selected}
      selectionMode={selectionMode}
      thread={thread}
      onOpen={() => onOpen(thread)}
      onSelect={() => toggleThreadSelected(thread.id)}
    />
  );
}
