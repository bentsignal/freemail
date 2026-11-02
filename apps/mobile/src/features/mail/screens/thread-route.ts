import type { MailThread } from "@rodge-mail/features/mail";

import type { MobileMailbox } from "../store";

const THREAD_PATHNAME = "/(tabs)/(inbox)/thread/[id]";

/** Carries the sender so the reader's header has its title before the thread loads. */
export function getThreadRoute(thread: MailThread, mailbox?: MobileMailbox) {
  return {
    pathname: THREAD_PATHNAME,
    params: {
      id: thread.id,
      title: thread.sender.name,
      ...(mailbox ? { mailbox } : {}),
    },
  } as const;
}
