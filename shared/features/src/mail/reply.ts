interface ReplyAddress {
  address: string;
  name?: string;
}

interface ReplyMessage {
  from: ReplyAddress;
  replyTo?: ReplyAddress[];
  to?: ReplyAddress[];
}

export function getReplyAddress(
  messages: readonly ReplyMessage[],
  accountAddress: string,
) {
  return getReplyRecipient(messages, accountAddress)?.address;
}

/** Who a reply goes to, named as the thread names them when it does. */
export function getReplyRecipient(
  messages: readonly ReplyMessage[],
  accountAddress: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const recipient = getMessageReplyRecipient(message, accountAddress);
    if (recipient) {
      const name = recipient.name?.trim();
      return {
        address: recipient.address,
        name: name?.length ? name : findName(messages, recipient.address),
      };
    }
  }

  return undefined;
}

function getMessageReplyRecipient(
  message: ReplyMessage,
  accountAddress: string,
) {
  const replyTo = message.replyTo?.find(
    (address) => !sameAddress(address.address, accountAddress),
  );
  if (replyTo) return replyTo;
  if (!sameAddress(message.from.address, accountAddress)) {
    return message.from;
  }
  return message.to?.find(
    (address) => !sameAddress(address.address, accountAddress),
  );
}

function findName(messages: readonly ReplyMessage[], address: string) {
  for (const message of messages) {
    for (const candidate of [
      message.from,
      ...(message.replyTo ?? []),
      ...(message.to ?? []),
    ]) {
      const name = candidate.name?.trim();
      if (name && sameAddress(candidate.address, address)) return name;
    }
  }
  return undefined;
}

function sameAddress(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
