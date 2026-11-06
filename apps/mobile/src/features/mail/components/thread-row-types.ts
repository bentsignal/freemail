import type { MailThread } from "@freemail/features/mail";

import type { MobileMailbox } from "../store";

export interface ThreadRowProps {
  locationTag?: string;
  mailbox?: MobileMailbox;
  onDelete?: () => void;
  onMoveToInbox?: () => void;
  onOpen: () => void;
  onRestore?: () => void;
  onSelect?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  thread: MailThread;
}
