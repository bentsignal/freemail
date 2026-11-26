import { createEnv } from "convex-env";
import { v } from "convex/values";

export const providerEnv = createEnv({
  GOOGLE_OAUTH_CLIENT_ID: v.optional(v.string()),
  GOOGLE_OAUTH_CLIENT_SECRET: v.optional(v.string()),
  GMAIL_PUBSUB_TOPIC: v.optional(v.string()),
  GMAIL_PUSH_TOKEN: v.optional(v.string()),
  MICROSOFT_OAUTH_CLIENT_ID: v.optional(v.string()),
  MICROSOFT_OAUTH_CLIENT_SECRET: v.optional(v.string()),
  MICROSOFT_OAUTH_TENANT: v.optional(v.string()),
  PROVIDER_ACTIVE_CREDENTIAL_KEY_VERSION: v.optional(v.string()),
  PROVIDER_CREDENTIAL_KEYS: v.optional(v.string()),
});
