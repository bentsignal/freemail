import Constants from "expo-constants";

// eslint-disable-next-line no-restricted-syntax -- Expo exposes extra as any, so narrow it from unknown before access.
const extra: unknown = Constants.expoConfig?.extra;

/** Rodge Dev, the phone dev client (app.config.ts, docs/phone-testing.md). */
export const isRodgeDev =
  typeof extra === "object" &&
  extra !== null &&
  "appVariant" in extra &&
  extra.appVariant === "development";
