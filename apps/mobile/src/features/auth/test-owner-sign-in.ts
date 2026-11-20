import { completeAuthSession } from "@freemail/std/auth-session";

import { authClient, convexUrls } from "./client";

// Production, and the deployment it moved from: both hold real mail.
const REAL_MAIL_DEPLOYMENTS = ["colorful-ostrich-734", "dazzling-dog-633"];

/**
 * Freemail Dev only: signs in as the backend's test owner through its
 * dev-only `/dev/sign-in` route (services/convex/src/devSignIn.ts), which
 * production doesn't have.
 */
export async function signInAsTestOwner() {
  if (
    REAL_MAIL_DEPLOYMENTS.some(
      (name) =>
        convexUrls.cloud.includes(name) || convexUrls.site.includes(name),
    )
  ) {
    throw new Error("This app talks to production, which has no test owner");
  }
  let email = "";
  await completeAuthSession({
    authenticate: async () => {
      const result = await authClient.$fetch<{ email: string }>(
        "/dev/sign-in",
        { body: {}, method: "POST" },
      );
      if (result.data) email = result.data.email;
      return result;
    },
    confirmSession: async () => await authClient.getSession(),
    fallbackMessage: "This backend has no test owner",
    refreshSession: () => authClient.$store.notify("$sessionSignal"),
  });
  return email;
}
