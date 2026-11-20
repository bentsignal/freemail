import type { AuthContext, BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

import type { EmailCodeLimit } from "./emailCodeLimit";

const requestPath = "/email-otp/send-verification-otp";
const signInPath = "/sign-in/email-otp";
const requestBodySchema = z.object({ email: z.string(), type: z.string() });
const signInBodySchema = z.object({ email: z.string() });

/**
 * Narrows Better Auth's email OTP plugin to registration codes for an
 * account with no passkey. Every other email OTP route is closed, and an
 * account with a passkey is never issued or accepts a code.
 */
export function emailOtpAccess({ limit }: { limit: EmailCodeLimit }) {
  return {
    id: "email-otp-access",
    hooks: {
      before: [
        {
          matcher: (ctx) => isClosedPath(ctx.path),
          handler: createAuthMiddleware(() =>
            Promise.reject(new APIError("NOT_FOUND")),
          ),
        },
        {
          matcher: (ctx) => ctx.path === requestPath,
          handler: createAuthMiddleware(async (ctx) => {
            const body = requestBodySchema.safeParse(ctx.body);
            if (!body.success) throw new APIError("BAD_REQUEST");
            if (body.data.type !== "sign-in") {
              throw new APIError("BAD_REQUEST", {
                message: "Invalid OTP type",
              });
            }
            const email = body.data.email.toLowerCase();
            if (!(await acceptsEmailCode(ctx.context, email))) {
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(
                getSignInIdentifier(email),
              );
              return ctx.json({ success: true });
            }
            if (!(await limit("request"))) return ctx.json({ success: true });
          }),
        },
        {
          matcher: (ctx) => ctx.path === signInPath,
          handler: createAuthMiddleware(async (ctx) => {
            const body = signInBodySchema.safeParse(ctx.body);
            if (!body.success) throw invalidCodeError();
            const email = body.data.email.toLowerCase();
            const identifier = getSignInIdentifier(email);
            const adapter = ctx.context.internalAdapter;
            if (!(await acceptsEmailCode(ctx.context, email))) {
              await adapter.deleteVerificationByIdentifier(identifier);
              throw invalidCodeError();
            }
            if (!(await adapter.findVerificationValue(identifier))) {
              throw invalidCodeError();
            }
            if (!(await limit("verify"))) throw invalidCodeError();
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

async function acceptsEmailCode(context: AuthContext, email: string) {
  const found = await context.internalAdapter.findUserByEmail(email);
  if (!found) return false;
  const passkey = await context.adapter.findOne({
    model: "passkey",
    where: [{ field: "userId", value: found.user.id }],
  });
  return !passkey;
}

function isClosedPath(path: string | undefined) {
  return (
    path !== undefined &&
    path.includes("email-otp") &&
    path !== requestPath &&
    path !== signInPath
  );
}

function getSignInIdentifier(email: string) {
  return `sign-in-otp-${email}`;
}

function invalidCodeError() {
  return new APIError("BAD_REQUEST", {
    code: "INVALID_OTP",
    message: "Invalid OTP",
  });
}
