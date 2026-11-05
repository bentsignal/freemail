import { useRef } from "react";
import { Text, TextInput, View } from "react-native";

import { useColor } from "~/hooks/use-color";
import { isRodgeDev } from "../dev/app-variant";
import { NativeAuthButton } from "./native-auth-button";
import { useEmailCodeAuth } from "./use-email-code-auth";

const inputClassName =
  "bg-muted text-foreground h-[50px] rounded-xl px-4 text-[17px]";

export function EmailCodeSignIn() {
  if (!isRodgeDev) return null;
  return <EmailCodeForm />;
}

function EmailCodeForm() {
  const auth = useEmailCodeAuth();
  const email = useRef("");
  const code = useRef("");
  const placeholder = useColor("muted-foreground");

  return (
    <View className="gap-3">
      <EmailStep
        hidden={auth.codeSentTo !== undefined}
        isBusy={auth.isBusy}
        onChange={(value) => (email.current = value)}
        onSubmit={() => void auth.sendCode(email.current)}
        placeholder={placeholder}
      />
      <CodeStep
        hidden={auth.codeSentTo === undefined}
        isBusy={auth.isBusy}
        onChange={(value) => (code.current = value)}
        onSubmit={() => void auth.verifyCode(code.current)}
        placeholder={placeholder}
      />
      <Message message={auth.message} />
    </View>
  );
}

interface StepProps {
  hidden: boolean;
  isBusy: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
}

function EmailStep({
  hidden,
  isBusy,
  onChange,
  onSubmit,
  placeholder,
}: StepProps) {
  if (hidden) return null;
  return (
    <>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        className={inputClassName}
        keyboardType="email-address"
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="Email"
        placeholderTextColor={placeholder}
        returnKeyType="send"
        textContentType="emailAddress"
      />
      <NativeAuthButton
        disabled={isBusy}
        label="Email me a sign-in code"
        onPress={onSubmit}
        variant="outlined"
      />
    </>
  );
}

function CodeStep({
  hidden,
  isBusy,
  onChange,
  onSubmit,
  placeholder,
}: StepProps) {
  if (hidden) return null;
  return (
    <>
      <TextInput
        autoComplete="one-time-code"
        autoFocus
        className={inputClassName}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="6-digit code"
        placeholderTextColor={placeholder}
        textContentType="oneTimeCode"
      />
      <NativeAuthButton
        disabled={isBusy}
        label="Sign in with code"
        onPress={onSubmit}
        variant="outlined"
      />
    </>
  );
}

function Message({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text className="text-muted-foreground text-center text-sm">{message}</Text>
  );
}
