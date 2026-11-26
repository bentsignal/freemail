import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

import type { DataModel } from "./_generated/dataModel";
import { internalMutation as rawInternalMutation } from "./_generated/server";
import { registerInboxUnreadTriggers } from "./mail/inboxUnread";

const triggers = new Triggers<DataModel>();
registerInboxUnreadTriggers(triggers);

/**
 * Gives a mutation's `ctx.db` the registered table triggers; `authedMutation`
 * in utils applies it to public mutations.
 */
export const withTriggers = triggers.wrapDB;

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(withTriggers),
);
