import { createEnv } from "convex-env";
import { v } from "convex/values";

export const hostedEnv = createEnv({
  HOSTED_MAIL_AWS_REGION: v.optional(v.string()),
  HOSTED_MAIL_AWS_ACCESS_KEY_ID: v.optional(v.string()),
  HOSTED_MAIL_AWS_SECRET_ACCESS_KEY: v.optional(v.string()),
  HOSTED_MAIL_BUCKET: v.optional(v.string()),
  HOSTED_MAIL_CONFIGURATION_SET: v.optional(v.string()),
  HOSTED_MAIL_TOPIC_ARNS: v.optional(v.string()),
  HOSTED_MAIL_WEBHOOK_TOKEN: v.optional(v.string()),
});

export function requireSesConfig() {
  const {
    HOSTED_MAIL_AWS_REGION: region,
    HOSTED_MAIL_AWS_ACCESS_KEY_ID: accessKeyId,
    HOSTED_MAIL_AWS_SECRET_ACCESS_KEY: secretAccessKey,
    HOSTED_MAIL_CONFIGURATION_SET: configurationSet,
  } = hostedEnv;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("Amazon SES is not configured");
  }
  return { region, accessKeyId, secretAccessKey, configurationSet };
}

export function requireHostedMailConfig() {
  const bucket = hostedEnv.HOSTED_MAIL_BUCKET;
  if (!bucket) throw new Error("Hosted mail is not configured");
  return { ...requireSesConfig(), bucket };
}

export function hostedTopicArns() {
  return new Set(
    (hostedEnv.HOSTED_MAIL_TOPIC_ARNS ?? "")
      .split(",")
      .map((arn) => arn.trim())
      .filter(Boolean),
  );
}
