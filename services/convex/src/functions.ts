import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

import type { DataModel } from "./_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
import { registerInboxUnreadTriggers } from "./mail/inboxUnread";

const triggers = new Triggers<DataModel>();
registerInboxUnreadTriggers(triggers);

/** Gives a mutation's `ctx.db` the registered table triggers. */
export const withTriggers = triggers.wrapDB;

export const mutation = customMutation(rawMutation, customCtx(withTriggers));

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(withTriggers),
);
