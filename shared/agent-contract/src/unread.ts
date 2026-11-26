import { z } from "zod";

import {
  classificationCategorySchema,
  convexIdSchema,
  mailboxAddressSchema,
  timestampSchema,
  untrustedContentMarkerSchema,
} from "./common";

export const MAX_AGENT_UNREAD_THREADS = 50;
export const DEFAULT_AGENT_UNREAD_THREADS = 20;

export const listUnreadInputSchema = z
  .object({
    accountId: convexIdSchema.optional(),
    limit: z.number().int().min(1).max(MAX_AGENT_UNREAD_THREADS).optional(),
  })
  .strict();

export const agentUnreadThreadSchema = z
  .object({
    threadId: convexIdSchema,
    accountId: convexIdSchema,
    accountAddress: z.string().min(1).max(320),
    from: mailboxAddressSchema,
    subject: z.string().max(2_000),
    snippet: z.string().max(2_000),
    receivedAt: timestampSchema,
    unreadCount: z.number().int().positive(),
    messageCount: z.number().int().nonnegative(),
    hasAttachments: z.boolean(),
    importance: z.number().min(0).max(1).optional(),
    category: classificationCategorySchema.optional(),
    classificationSummary: z.string().max(280).optional(),
  })
  .strict();

export const listUnreadOutputSchema = z
  .object({
    content: untrustedContentMarkerSchema,
    totalUnreadThreads: z.number().int().nonnegative(),
    threads: z.array(agentUnreadThreadSchema).max(MAX_AGENT_UNREAD_THREADS),
  })
  .strict();

export type AgentUnreadThread = z.infer<typeof agentUnreadThreadSchema>;
export type ListUnreadInput = z.infer<typeof listUnreadInputSchema>;
export type ListUnreadOutput = z.infer<typeof listUnreadOutputSchema>;
