import type { LayoutChangeEvent, ScrollView } from "react-native";
import { useRef } from "react";
import { Platform } from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";

import type { MessageJumpLayout } from "./message-jump-offset";
import { getMessageJumpOffset } from "./message-jump-offset";

/**
 * Jumps to a linked message once, after its first layout. Later layouts, such
 * as switching between Clean and Original, leave the scroll position alone.
 */
export function useJumpToMessage() {
  const scrollViewRef = useRef<ScrollView>(null);
  const headerHeight = useHeaderHeight();
  const measured = useRef<
    Partial<Omit<MessageJumpLayout, "topInset">> & { hasJumped?: boolean }
  >({});
  function measure(next: Partial<Omit<MessageJumpLayout, "topInset">>) {
    Object.assign(measured.current, next);
    const { contentHeight, hasJumped, messageY, viewportHeight } =
      measured.current;
    if (
      hasJumped ||
      contentHeight === undefined ||
      messageY === undefined ||
      viewportHeight === undefined
    ) {
      return;
    }
    measured.current.hasJumped = true;
    scrollViewRef.current?.scrollTo({
      animated: false,
      y: getMessageJumpOffset({
        contentHeight,
        messageY,
        // Only iOS draws the content under its transparent header.
        topInset: Platform.OS === "ios" ? headerHeight : 0,
        viewportHeight,
      }),
    });
  }
  return {
    onMessageLayout: (event: LayoutChangeEvent) =>
      measure({ messageY: event.nativeEvent.layout.y }),
    scrollViewProps: {
      onContentSizeChange: (_width: number, contentHeight: number) =>
        measure({ contentHeight }),
      onLayout: (event: LayoutChangeEvent) =>
        measure({ viewportHeight: event.nativeEvent.layout.height }),
      ref: scrollViewRef,
    },
  };
}
