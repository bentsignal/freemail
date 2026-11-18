import { createEnv } from "convex-env";
import { v } from "convex/values";

import { httpAction } from "../_generated/server";
import { rateLimiter } from "../limiter";
import { sendTextEmail } from "../providers/hosted/aws";
import { handleTransactionalSend } from "./send";

const transactionalMailEnv = createEnv({
  TRANSACTIONAL_MAIL_CLIENTS: v.optional(v.string()),
});

export const sendTransactionalMail = httpAction(async (ctx, request) =>
  handleTransactionalSend(request, {
    clientsConfig: transactionalMailEnv.TRANSACTIONAL_MAIL_CLIENTS,
    consumeRateLimit: async (clientName) => {
      const { ok } = await rateLimiter.limit(ctx, "transactionalMail", {
        key: clientName,
      });
      return ok;
    },
    send: async (message) => {
      await sendTextEmail(message);
    },
  }),
);
