import type { MailMessage } from "@rodge-mail/features/mail";

export function getMessageAddressRows(
  message: Pick<MailMessage, "cc" | "from" | "replyTo" | "to">,
) {
  const rows = [
    { addresses: [message.from], label: "From" },
    { addresses: getDistinctReplyTo(message), label: "Reply-To" },
    { addresses: message.to, label: "To" },
    { addresses: message.cc, label: "Cc" },
  ];
  return rows.filter((row) => row.addresses.length > 0);
}

/** Replies going to the sender aren't worth a row; going elsewhere is. */
function getDistinctReplyTo({
  from,
  replyTo = [],
}: Pick<MailMessage, "from" | "replyTo">) {
  const sender = from.address.toLowerCase();
  const repliesToSender = replyTo.every(
    (address) => address.address.toLowerCase() === sender,
  );
  return repliesToSender ? [] : replyTo;
}
