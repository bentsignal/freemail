/// <reference types="vite/client" />
import type { BetterAuthOptions } from "better-auth/minimal";
import { passkey } from "@better-auth/passkey";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { generateRandomString } from "better-auth/crypto";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { convexTest } from "convex-test";
import { z } from "zod";

import type { EmailCodeLimit } from "./emailCodeLimit";
import { privateAccountHooks } from "./authAccess";
import { createEmailCodeLimit } from "./emailCodeLimit";
import { emailOtpAccess } from "./emailOtpAccess";
import { passkeyRecovery } from "./passkeyRecovery";
import schema from "./schema";

export const ownerEmail = "owner@example.com";

const modules = import.meta.glob("/src/**/*.ts");
const baseURL = "https://auth.example.com";
const responseBodySchema = z.record(z.string(), z.unknown());

/**
 * Better Auth with the production email code plugins on a memory adapter.
 * Each request runs in its own Convex action with a new auth instance, as
 * the HTTP router does, so only the rate limiter component carries state
 * between requests. Every request comes from a different client address.
 */
export function createConvex() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

export function createFixture({ hasPasskey = true } = {}) {
  const t = createConvex();
  const createdAt = new Date();
  const db = {
    account: [],
    passkey: hasPasskey
      ? [
          {
            backedUp: false,
            counter: 0,
            createdAt,
            credentialID: "credential-1",
            deviceType: "singleDevice",
            id: "passkey-1",
            name: "Phone",
            publicKey: "public-key",
            transports: "internal",
            userId: "owner",
          },
        ]
      : [],
    session: [],
    user: [
      {
        createdAt,
        email: ownerEmail,
        emailVerified: true,
        id: "owner",
        name: "Owner",
        updatedAt: createdAt,
      },
    ],
    verification: [],
  };
  const issuedCodes = new Array<string>();

  function createTestAuth(limit: EmailCodeLimit) {
    return betterAuth({
      baseURL,
      database: memoryAdapter(db),
      databaseHooks: privateAccountHooks("owner"),
      secret: "test-secret-0123456789abcdef0123456789abcdef",
      plugins: [
        passkeyRecovery({ from: "Freemail <auth@example.com>", limit }),
        emailOtpAccess({ limit }),
        emailOTP({
          allowedAttempts: 3,
          disableSignUp: true,
          expiresIn: 300,
          generateOTP: () => {
            const code = generateRandomString(6, "0-9");
            issuedCodes.push(code);
            return code;
          },
          sendVerificationOTP: () => Promise.resolve(),
          storeOTP: "hashed",
        }),
        passkey(),
      ],
    } satisfies BetterAuthOptions);
  }

  function withAuth<T>(
    run: (auth: ReturnType<typeof createTestAuth>) => Promise<T>,
  ) {
    return run(createTestAuth(() => Promise.resolve(true)));
  }

  let requests = 0;
  function post(path: string, body: unknown) {
    const ip = `198.51.100.${++requests % 250}`;
    return t.action(async (ctx) => {
      const auth = createTestAuth(createEmailCodeLimit(ctx));
      const response = await auth.handler(
        new Request(`${baseURL}/api/auth${path}`, {
          body: JSON.stringify(body),
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          method: "POST",
        }),
      );
      const text = await response.text();
      return {
        body: text ? responseBodySchema.parse(JSON.parse(text)) : null,
        setCookie: response.headers.get("set-cookie"),
        status: response.status,
      };
    });
  }

  return { db, issuedCodes, post, withAuth };
}

export function wrongCode(code: string) {
  return String((Number(code) + 1) % 1_000_000).padStart(6, "0");
}
