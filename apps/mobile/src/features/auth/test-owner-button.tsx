import { useState } from "react";
import { Text, View } from "react-native";

import { isFreemailDev } from "../dev/app-variant";
import { NativeAuthButton } from "./native-auth-button";
import { signInAsTestOwner } from "./test-owner-sign-in";

export function TestOwnerSignIn() {
  if (!isFreemailDev) return null;
  return <TestOwnerButton />;
}

function TestOwnerButton() {
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function signIn() {
    setIsBusy(true);
    setMessage(undefined);
    try {
      await signInAsTestOwner();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed");
    }
    setIsBusy(false);
  }

  return (
    <View className="gap-3">
      <NativeAuthButton
        disabled={isBusy}
        label="Sign in as test owner"
        onPress={() => void signIn()}
        variant="outlined"
      />
      <Message message={message} />
    </View>
  );
}

function Message({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text className="text-muted-foreground text-center text-sm">{message}</Text>
  );
}
