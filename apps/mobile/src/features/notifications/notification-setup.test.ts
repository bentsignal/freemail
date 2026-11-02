import { describe, expect, it } from "vitest";

import {
  getNotificationRegistrationStep,
  isNotificationDeliveryEnabled,
  resolveNotificationSetupState,
} from "./notification-setup";

describe("notification setup state", () => {
  it("does not report delivery ready without both permission and a token", () => {
    expect(
      resolveNotificationSetupState({
        hasStoredToken: false,
        isDevice: true,
        permission: "granted",
      }),
    ).toBe("setup-required");
    expect(
      resolveNotificationSetupState({
        hasStoredToken: true,
        isDevice: true,
        permission: "undetermined",
      }),
    ).toBe("setup-required");
  });

  it("distinguishes denied permission and unsupported simulators", () => {
    expect(
      resolveNotificationSetupState({
        hasStoredToken: true,
        isDevice: true,
        permission: "denied",
      }),
    ).toBe("permission-denied");
    expect(
      resolveNotificationSetupState({
        hasStoredToken: true,
        isDevice: false,
        permission: "granted",
      }),
    ).toBe("unsupported");
  });

  it("only renders an enabled preference as deliverable when ready", () => {
    expect(isNotificationDeliveryEnabled(true, "setup-required")).toBe(false);
    expect(isNotificationDeliveryEnabled(true, "ready")).toBe(true);
    expect(isNotificationDeliveryEnabled(false, "ready")).toBe(false);
  });

  it("restores granted permission and asks again when iOS has forgotten it", () => {
    function step(
      permission: "denied" | "granted" | "undetermined",
      overrides = {},
    ) {
      return getNotificationRegistrationStep({
        isDevice: true,
        permission,
        preferenceEnabled: true,
        ...overrides,
      });
    }

    expect(step("granted")).toBe("restore");
    expect(step("undetermined")).toBe("ask");
    expect(step("denied")).toBe("none");
    expect(step("undetermined", { preferenceEnabled: false })).toBe("none");
    expect(step("granted", { preferenceEnabled: false })).toBe("none");
    expect(step("undetermined", { isDevice: false })).toBe("none");
  });
});
