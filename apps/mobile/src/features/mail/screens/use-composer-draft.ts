import type { SetStateAction } from "react";
import { useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import type { ComposerDraft } from "@freemail/features/mail";
import { isReplyDraftWorthKeeping } from "@freemail/features/mail";

import type { NativeComposerAttachment } from "./use-native-attachments";
import {
  deleteReplyDraft,
  readReplyDraft,
  saveReplyDraft,
} from "../reply-drafts";
import { createComposerDraft } from "./composer-helpers";

type Draft = ComposerDraft<NativeComposerAttachment>;

/**
 * The composer's message and sender. A reply (one with a thread) is kept as
 * it's written, so closing the sheet to reread the thread and tapping Reply
 * again picks it back up; sending deletes it.
 */
export function useComposerDraft(params: {
  accountId?: string;
  bcc?: string;
  body?: string;
  cc?: string;
  subject?: string;
  threadId?: string;
  to?: string;
}) {
  const router = useRouter();
  const threadId = params.threadId;
  const [initial] = useState(() => {
    const saved = threadId ? readReplyDraft(threadId) : undefined;
    return {
      accountId: saved?.accountId ?? params.accountId,
      draft: saved?.draft ?? createComposerDraft(params),
    };
  });
  const [selectedAccountId, setSelectedAccountState] = useState(
    initial.accountId,
  );
  const [draft, setDraftState] = useState(initial.draft);
  // The newest values, for updates that arrive between renders (uploads).
  const latest = useRef(initial);
  // Sent or deleted: an upload finishing afterwards mustn't bring it back.
  const finished = useRef(false);

  function update(next: { accountId: string | undefined; draft: Draft }) {
    latest.current = next;
    setDraftState(next.draft);
    setSelectedAccountState(next.accountId);
    if (threadId && !finished.current) {
      saveReplyDraft(threadId, next.draft, next.accountId);
    }
  }

  function setDraft(action: SetStateAction<Draft>) {
    const current = latest.current;
    update({
      ...current,
      draft: typeof action === "function" ? action(current.draft) : action,
    });
  }

  function setSelectedAccountId(action: SetStateAction<string | undefined>) {
    const current = latest.current;
    update({
      ...current,
      accountId:
        typeof action === "function" ? action(current.accountId) : action,
    });
  }

  function discard() {
    finished.current = true;
    if (threadId) deleteReplyDraft(threadId);
  }

  function cancel() {
    if (!threadId || !isReplyDraftWorthKeeping(draft)) {
      router.back();
      return;
    }
    Alert.alert("Keep this reply?", undefined, [
      {
        text: "Delete Draft",
        style: "destructive",
        onPress: () => {
          discard();
          router.back();
        },
      },
      { text: "Save Draft", onPress: router.back },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return {
    cancel,
    draft,
    onSent: discard,
    selectedAccountId,
    setDraft,
    setSelectedAccountId,
  };
}
