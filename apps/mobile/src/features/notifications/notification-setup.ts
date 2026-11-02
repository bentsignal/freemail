export type NotificationSetupState =
  | "permission-denied"
  | "ready"
  | "setup-required"
  | "unsupported";

export function resolveNotificationSetupState(args: {
  hasStoredToken: boolean;
  isDevice: boolean;
  permission: "denied" | "granted" | "undetermined";
}) {
  if (!args.isDevice) return "unsupported";
  if (args.permission === "denied") return "permission-denied";
  if (args.permission !== "granted" || !args.hasStoredToken) {
    return "setup-required";
  }
  return "ready";
}

export function isNotificationDeliveryEnabled(
  preferenceEnabled: boolean,
  setupState: NotificationSetupState,
) {
  return preferenceEnabled && setupState === "ready";
}

/**
 * iOS can forget an app's notification permission, which stops every push
 * while Apple still accepts them. "undetermined" means it can be asked again;
 * only an explicit denial is left to Settings.
 */
export function getNotificationRegistrationStep(args: {
  isDevice: boolean;
  permission: "denied" | "granted" | "undetermined";
  preferenceEnabled: boolean;
}) {
  if (!args.isDevice || !args.preferenceEnabled) return "none";
  if (args.permission === "granted") return "restore";
  if (args.permission === "undetermined") return "ask";
  return "none";
}
