import type { MailThread } from "@freemail/features/mail";

export function filterSpamThreads(threads: MailThread[], searchTerm: string) {
  const query = searchTerm.trim().toLocaleLowerCase();
  if (!query) return threads;
  return threads.filter((thread) =>
    [thread.sender.name, thread.sender.address, thread.subject, thread.preview]
      .join("\n")
      .toLocaleLowerCase()
      .includes(query),
  );
}
