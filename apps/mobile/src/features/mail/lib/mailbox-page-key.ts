export function getMailboxPageKey(
  mailbox: string,
  accountId: string | undefined,
  searchTerm = "",
) {
  return `${mailbox}:${accountId ?? "all"}:${searchTerm}`;
}
