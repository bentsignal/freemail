import { DeferredTab } from "~/components/deferred-tab";
import { ComposerScreen } from "~/features/mail/screens/composer-screen";

export default function NewMessage() {
  return (
    <DeferredTab afterMs={2000}>
      <ComposerScreen variant="tab" />
    </DeferredTab>
  );
}
