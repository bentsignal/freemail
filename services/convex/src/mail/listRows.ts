import type { Doc } from "../_generated/dataModel";
import type { toMessageListItem } from "./helpers";

type MessageListItem = NonNullable<
  Awaited<ReturnType<typeof toMessageListItem>>
>;

/**
 * A mail list row: what the lists draw and act on, without the message's
 * headers, search text, recipients, or the classifier's working record.
 * Those made up most of what a page of the inbox sent, and the apps read
 * them only from the thread (`getThread`). Optional fields stay optional, so
 * a full message still fits where a row does.
 */
export function toListRow(item: MessageListItem) {
  return {
    _creationTime: item._creationTime,
    _id: item._id,
    account: item.account,
    accountId: item.accountId,
    ...(item.archivedAt === undefined ? {} : { archivedAt: item.archivedAt }),
    classification: item.classification
      ? toListClassification(item.classification)
      : null,
    direction: item.direction,
    from: item.from,
    hasAttachments: item.hasAttachments,
    inInbox: item.inInbox,
    isPinned: item.isPinned,
    isRead: item.isRead,
    location: item.location,
    mailingList: item.mailingList,
    receivedAt: item.receivedAt,
    ...(item.sentAt === undefined ? {} : { sentAt: item.sentAt }),
    snippet: item.snippet,
    subject: item.subject,
    threadId: item.threadId,
    updatedAt: item.updatedAt,
  };
}

function toListClassification(classification: Doc<"messageClassifications">) {
  return {
    _id: classification._id,
    category: classification.category,
    importance: classification.importance,
    ...(classification.isSpam === undefined
      ? {}
      : { isSpam: classification.isSpam }),
    status: classification.status,
    summary: classification.summary,
    updatedAt: classification.updatedAt,
  };
}
