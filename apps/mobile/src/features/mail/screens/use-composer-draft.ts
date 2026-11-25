import type { SetStateAction } from "react";
import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import type { ComposerDraft } from "@freemail/features/mail";

import type { NativeComposerAttachment } from "./use-native-attachments";
import { isWorthKeeping } from "../lib/reply-drafts-file";
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
  const [saved] = useState(() =>
    threadId ? readReplyDraft(threadId) : undefined,
  );
  const [selectedAccountId, setSelectedAccountState] = useState(
    saved?.accountId ?? params.accountId,
  );
  const [draft, setDraftState] = useState(
    () => saved?.draft ?? createComposerDraft(params),
  );

  function setDraft(action: SetStateAction<Draft>) {
    setDraftState((current) => {
      const next = typeof action === "function" ? action(current) : action;
      if (threadId) saveReplyDraft(threadId, next, selectedAccountId);
      return next;
    });
  }

  function setSelectedAccountId(action: SetStateAction<string | undefined>) {
    setSelectedAccountState((current) => {
      const next = typeof action === "function" ? action(current) : action;
      if (threadId) saveReplyDraft(threadId, draft, next);
      return next;
    });
  }

  function onSent() {
    if (threadId) deleteReplyDraft(threadId);
  }

  function cancel() {
    if (!threadId || !isWorthKeeping(draft)) {
      router.back();
      return;
    }
    Alert.alert("Keep this reply?", undefined, [
      {
        text: "Delete Draft",
        style: "destructive",
        onPress: () => {
          deleteReplyDraft(threadId);
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
    onSent,
    selectedAccountId,
    setDraft,
    setSelectedAccountId,
  };
}
