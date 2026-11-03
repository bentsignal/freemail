import { router, useFocusEffect } from "expo-router";

import { takeHeldComposeHref } from "~/features/mail/lib/mailto";
import { InboxScreen } from "~/features/mail/screens/inbox-screen";

export default function Inbox() {
  useFocusEffect(() => {
    const href = takeHeldComposeHref();
    if (href) router.push(href);
  });

  return <InboxScreen />;
}
