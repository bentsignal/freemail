import type { GenericCtx } from "@convex-dev/better-auth";
import type { GenericActionCtx } from "convex/server";

import type { DataModel } from "./_generated/dataModel";
import { rateLimiter } from "./limiter";

export type EmailCodeStep = "request" | "verify";
export type EmailCodeLimit = ReturnType<typeof createEmailCodeLimit>;

const limitNames = {
  request: "emailCodeRequest",
  verify: "emailCodeVerify",
} as const;

/**
 * One budget for every emailed code, shared by both auth instances and not
 * keyed on the client. Only an action ctx is accepted: its spent token is
 * committed even when the request then fails, which a mutation would roll
 * back.
 */
export function createEmailCodeLimit(ctx: GenericCtx<DataModel>) {
  return async (step: EmailCodeStep) => {
    if (!isActionCtx(ctx)) return false;
    const { ok } = await rateLimiter.limit(ctx, limitNames[step]);
    return ok;
  };
}

function isActionCtx(
  ctx: GenericCtx<DataModel>,
): ctx is GenericActionCtx<DataModel> {
  return "runAction" in ctx && !("db" in ctx);
}
