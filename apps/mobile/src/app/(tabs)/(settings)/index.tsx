import { DeferredTab } from "~/components/deferred-tab";
import { SettingsScreen } from "~/features/settings/settings-screen";

export default function Settings() {
  return (
    <DeferredTab afterMs={2500}>
      <SettingsScreen />
    </DeferredTab>
  );
}
