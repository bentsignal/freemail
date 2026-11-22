import { DeferredTab } from "~/components/deferred-tab";
import { InboxScreen } from "~/features/mail/screens/inbox-screen";

export default function Search() {
  return (
    <DeferredTab afterMs={3000}>
      <InboxScreen searchMode />
    </DeferredTab>
  );
}
