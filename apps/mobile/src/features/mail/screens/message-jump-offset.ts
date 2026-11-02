const JUMP_MARGIN = 16;

export interface MessageJumpLayout {
  contentHeight: number;
  messageY: number;
  topInset: number;
  viewportHeight: number;
}

/** The scroll offset that puts a message just below the header, never past either end of the content. */
export function getMessageJumpOffset({
  contentHeight,
  messageY,
  topInset,
  viewportHeight,
}: MessageJumpLayout) {
  const restingOffset = -topInset;
  const maxOffset = Math.max(restingOffset, contentHeight - viewportHeight);
  return Math.min(messageY - topInset - JUMP_MARGIN, maxOffset);
}
