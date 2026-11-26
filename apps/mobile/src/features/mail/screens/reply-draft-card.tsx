import { Pressable, Text, View } from "react-native";

import { PencilLine } from "~/components/icons";
import { useColor } from "~/hooks/use-color";
import { useReplyDraft } from "../reply-drafts";

export function ReplyDraftCard({
  onPress,
  threadId,
}: {
  onPress: () => void;
  threadId: string;
}) {
  const draft = useReplyDraft(threadId);
  const destructive = useColor("destructive");
  if (!draft) return null;
  const preview = draft.body.trim();

  return (
    <Pressable
      accessibilityHint="Continues your reply"
      accessibilityLabel={`Draft reply${preview ? `, ${preview}` : ""}`}
      accessibilityRole="button"
      className="border-border border-t-hairline gap-2 pt-5 active:opacity-50"
      testID="reply-draft-card"
      onPress={onPress}
    >
      <View className="flex-row items-center gap-3">
        <View className="bg-muted size-10 items-center justify-center rounded-full">
          <PencilLine color={destructive} size={18} />
        </View>
        <Text className="text-destructive text-[17px] leading-[22px] font-semibold">
          Draft
        </Text>
      </View>
      <DraftPreview text={preview} />
    </Pressable>
  );
}

function DraftPreview({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Text
      className="text-muted-foreground text-base leading-6"
      numberOfLines={3}
    >
      {text}
    </Text>
  );
}
