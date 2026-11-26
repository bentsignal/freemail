import { useState } from "react";
import { createStore } from "rostra";

import type { Id } from "@freemail/convex/model";
import { useDebouncedInput } from "@freemail/std/use-debounced-input";

import { useComposerState } from "./use-composer-state";

const SEARCH_DEBOUNCE_MS = 600;

export type MailAccountFilter = "all" | Id<"mailAccounts">;

export interface ThreadSelection {
  messageId: Id<"messages">;
  threadId: Id<"threads">;
}

function useInternalStore({
  initialAccountFilter,
  initialSelection,
  initialUnreadOnly,
}: {
  initialAccountFilter: MailAccountFilter;
  initialSelection?: ThreadSelection;
  initialUnreadOnly: boolean;
}) {
  const [accountFilter, setAccountFilterState] =
    useState<MailAccountFilter>(initialAccountFilter);
  const {
    debouncedValue: debouncedSearchQuery,
    setValue: setSearchQueryState,
    setValueImmediately: setSearchQueryImmediately,
    value: searchQuery,
  } = useDebouncedInput({ initialValue: "", timeInMs: SEARCH_DEBOUNCE_MS });
  const [selection, setSelection] = useState(initialSelection);
  const [bulkSelectionIsActive, setBulkSelectionIsActive] = useState(false);
  const [bulkSelectedThreadIds, setBulkSelectedThreadIds] = useState<
    Set<Id<"threads">>
  >(() => new Set());
  const [mobileReaderIsOpen, setMobileReaderIsOpen] = useState(
    initialSelection !== undefined,
  );
  const [unreadOnly, setUnreadOnlyState] = useState(initialUnreadOnly);
  const [viewSessionId, setViewSessionId] = useState(0);
  const composer = useComposerState();

  function resetSelection() {
    setSelection(undefined);
    setMobileReaderIsOpen(false);
  }

  function setAccountFilter(nextAccountFilter: MailAccountFilter) {
    if (accountFilter === nextAccountFilter) return;
    setAccountFilterState(nextAccountFilter);
    setViewSessionId((current) => current + 1);
    resetSelection();
    setBulkSelectionIsActive(false);
    setBulkSelectedThreadIds(new Set());
  }

  function selectThread(nextSelection: ThreadSelection) {
    setSelection(nextSelection);
    setMobileReaderIsOpen(true);
  }

  function setBulkSelectionActive(isActive: boolean) {
    setBulkSelectionIsActive(isActive);
    if (!isActive) setBulkSelectedThreadIds(new Set());
  }

  function toggleBulkThread(threadId: Id<"threads">) {
    setBulkSelectedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  return {
    ...composer,
    accountFilter,
    bulkSelectedThreadIds,
    bulkSelectionIsActive,
    clearBulkSelection: () => setBulkSelectedThreadIds(new Set()),
    clearSelection: resetSelection,
    closeMobileReader: () => setMobileReaderIsOpen(false),
    mobileReaderIsOpen,
    debouncedSearchQuery:
      searchQuery.trim().length === 0 ? "" : debouncedSearchQuery.trim(),
    searchQuery,
    selectThread,
    selectedMessageId: selection?.messageId,
    selectedThreadId: selection?.threadId,
    setAccountFilter,
    setBulkSelectionActive,
    setInitialSelection: (nextSelection: ThreadSelection) =>
      setSelection((current) => current ?? nextSelection),
    setMailboxSelection: (nextSelection: ThreadSelection) =>
      setSelection(nextSelection),
    setSearchQuery: (query: string) => {
      if (query.trim().length === 0) {
        setSearchQueryImmediately(query);
      } else {
        setSearchQueryState(query);
      }
      setBulkSelectedThreadIds(new Set());
      setViewSessionId((current) => current + 1);
    },
    setUnreadOnly: (nextUnreadOnly: boolean) => {
      if (unreadOnly === nextUnreadOnly) return;
      setUnreadOnlyState(nextUnreadOnly);
      setViewSessionId((current) => current + 1);
      setBulkSelectedThreadIds(new Set());
    },
    toggleBulkThread,
    unreadOnly,
    viewSessionId,
  };
}

export const { Store: MailStore, useStore: useMailStore } =
  createStore(useInternalStore);
