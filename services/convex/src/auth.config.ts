import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

import { sharedAuthIssuer, sharedAuthJwksUri } from "@freemail/config/auth";

import { env } from "./convex.env";

const usesOwnAuthProvider = env.ENVIRONMENT === "production";
const trustsSharedDevelopmentAuth =
  env.ENVIRONMENT === "development" && !usesOwnAuthProvider;

const sharedDevelopmentAuthProviders = (
  sharedAuthIssuer && sharedAuthJwksUri
    ? [
        {
          type: "customJwt",
          issuer: sharedAuthIssuer,
          applicationID: "convex",
          algorithm: "RS256",
          jwks: sharedAuthJwksUri,
        },
      ]
    : []
) satisfies AuthConfig["providers"];

// Used by BetterAuth's convex() plugin — only the primary provider
export const primaryAuthConfig = {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;

/**
 * The primary provider, checking tokens against AUTH_JWKS when it's set: the
 * public keys as the auth routes serve them (`/api/auth/convex/jwks`).
 * Without it, Convex fetches them from those routes to check a new
 * connection's token, and a cold open waited on that (AUTH.md, "Signing
 * keys"). Better Auth still signs with the keys in its own table.
 */
export function getPrimaryProvider(publicJwks: string | undefined) {
  const provider = getAuthConfigProvider();
  if (!publicJwks || !isJwks(publicJwks)) return provider;
  return {
    ...provider,
    jwks: `data:text/plain;charset=utf-8;base64,${btoa(publicJwks)}`,
  };
}

function isJwks(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "keys" in parsed &&
      Array.isArray(parsed.keys) &&
      parsed.keys.length > 0
    );
  } catch {
    return false;
  }
}

// Used by Convex's auth system — includes worktree trust for non-main deployments
export default {
  providers: [
    getPrimaryProvider(
      "AUTH_JWKS" in process.env ? process.env.AUTH_JWKS : undefined,
    ),
    ...(trustsSharedDevelopmentAuth ? sharedDevelopmentAuthProviders : []),
  ],
} satisfies AuthConfig;
