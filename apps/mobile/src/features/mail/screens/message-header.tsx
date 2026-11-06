import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import type { MailAddress, MailMessage } from "@freemail/features/mail";

import { useColor } from "~/hooks/use-color";
import { formatMessageTime } from "../lib/mail-format";
import { getMessageAddressRows } from "./message-address-rows";

export function MessageHeader({ message }: { message: MailMessage }) {
  const [expanded, setExpanded] = useState(false);
  const mutedForeground = useColor("muted-foreground");
  const senderName = message.from.name || message.from.address;
  const sentAt = formatMessageTime(message.sentAt);
  const recipients = formatRecipients(message);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View className="gap-3">
      <Pressable
        accessibilityLabel={`From ${senderName}, ${sentAt}, ${recipients}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-start gap-3 active:opacity-50"
        onPress={() => setExpanded(!expanded)}
      >
        <View className="bg-muted size-10 items-center justify-center rounded-full">
          <Text className="text-foreground text-[17px] font-semibold">
            {senderName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text
              className="text-foreground min-w-0 flex-1 text-[17px] leading-[22px] font-semibold"
              numberOfLines={1}
            >
              {senderName}
            </Text>
            <Text className="text-muted-foreground text-[15px] leading-5">
              {sentAt}
            </Text>
          </View>
          <View className="flex-row items-start gap-2">
            <Text
              className="text-muted-foreground min-w-0 flex-1 text-[15px] leading-5"
              numberOfLines={2}
            >
              {recipients}
            </Text>
            <View className="h-5 justify-center">
              <Chevron color={mutedForeground} size={16} />
            </View>
          </View>
        </View>
      </Pressable>
      <MessageAddressDetails expanded={expanded} message={message} />
    </View>
  );
}

function MessageAddressDetails({
  expanded,
  message,
}: {
  expanded: boolean;
  message: MailMessage;
}) {
  if (!expanded) return null;
  return (
    <View className="bg-muted gap-2.5 rounded-xl px-3.5 py-3">
      {getMessageAddressRows(message).map((row) => (
        <View className="flex-row gap-3" key={row.label}>
          <Text className="text-muted-foreground w-[62px] text-[13px] leading-5">
            {row.label}
          </Text>
          <View className="min-w-0 flex-1 gap-2">
            {row.addresses.map((address) => (
              <AddressLines address={address} key={address.address} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function AddressLines({ address }: { address: MailAddress }) {
  return (
    <View>
      <AddressName address={address} />
      <Text className="text-muted-foreground text-[15px] leading-5" selectable>
        {address.address}
      </Text>
    </View>
  );
}

function AddressName({ address }: { address: MailAddress }) {
  if (!address.name || address.name === address.address) return null;
  return (
    <Text className="text-foreground text-[15px] leading-5" selectable>
      {address.name}
    </Text>
  );
}

function formatRecipients(message: MailMessage) {
  const to = `To: ${names(message.to)}`;
  if (message.cc.length === 0) return to;
  return `${to}  Cc: ${names(message.cc)}`;
}

function names(addresses: MailMessage["to"]) {
  return addresses.map((address) => address.name || address.address).join(", ");
}
