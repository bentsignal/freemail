import { Platform } from "react-native";
import { Stack } from "expo-router";

// A thread opened straight from a notification or link still has the inbox
// under it to go back to.
export const unstable_settings = { anchor: "index" };

export default function InboxLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        headerTransparent: Platform.OS === "ios",
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerLargeTitle: true, title: "All Inboxes" }}
      />
      <Stack.Screen name="thread/[id]" options={{ title: "" }} />
    </Stack>
  );
}
