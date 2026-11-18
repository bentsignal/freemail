import { z } from "zod";

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_TEXT_LENGTH = 5000;
const MAX_BODY_BYTES = 16 * 1024;

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .regex(/^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/u);

const clientSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9-]{1,64}$/u),
  tokenSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/iu)
    .transform((hash) => hash.toLowerCase()),
  from: emailSchema,
  fromName: z.string().regex(/^[\w .'&()-]{1,64}$/u),
  to: z.array(emailSchema).min(1),
});

const clientsSchema = z.array(clientSchema);

export type TransactionalMailClient = z.infer<typeof clientSchema>;

const sendRequestSchema = z.strictObject({
  to: emailSchema,
  subject: z
    .string()
    .min(1)
    .max(MAX_SUBJECT_LENGTH)
    .refine((subject) => !/[\r\n]/u.test(subject)),
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
});

export interface TransactionalMailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface TransactionalMailDeps {
  clientsConfig: string | undefined;
  consumeRateLimit: (clientName: string) => Promise<boolean>;
  send: (message: TransactionalMailMessage) => Promise<void>;
}

export class TransactionalMailConfigError extends Error {}

export function parseClients(config: string | undefined) {
  if (!config?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(config);
  } catch {
    throw new TransactionalMailConfigError(
      "TRANSACTIONAL_MAIL_CLIENTS is not valid JSON",
    );
  }
  const parsed = clientsSchema.safeParse(value);
  if (!parsed.success) {
    throw new TransactionalMailConfigError(
      "TRANSACTIONAL_MAIL_CLIENTS does not match the client schema",
    );
  }
  const names = new Set(parsed.data.map((client) => client.name));
  if (names.size !== parsed.data.length) {
    throw new TransactionalMailConfigError(
      "TRANSACTIONAL_MAIL_CLIENTS has duplicate client names",
    );
  }
  return parsed.data;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < right.length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function findClient(
  clients: TransactionalMailClient[],
  authorization: string | null,
) {
  const token = /^Bearer (\S+)$/u.exec(authorization ?? "")?.[1];
  if (!token) return undefined;
  const hash = await sha256Hex(token);
  let match: TransactionalMailClient | undefined;
  for (const client of clients) {
    if (constantTimeEqual(hash, client.tokenSha256)) match ??= client;
  }
  return match;
}

export function parseSendRequest(value: unknown) {
  const parsed = sendRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function isAllowedRecipient(
  client: TransactionalMailClient,
  to: string,
) {
  const recipient = to.toLowerCase();
  return client.to.some((allowed) => allowed.toLowerCase() === recipient);
}

export function senderAddress(client: TransactionalMailClient) {
  return `"${client.fromName}" <${client.from}>`;
}

export async function handleTransactionalSend(
  request: Request,
  deps: TransactionalMailDeps,
) {
  let clients: TransactionalMailClient[];
  try {
    clients = parseClients(deps.clientsConfig);
  } catch (error) {
    const reason =
      error instanceof TransactionalMailConfigError
        ? error.message
        : "TRANSACTIONAL_MAIL_CLIENTS could not be read";
    console.error(`transactional mail: ${reason}`);
    return json(500, { ok: false, error: "not_configured" });
  }

  const client = await findClient(
    clients,
    request.headers.get("authorization"),
  );
  if (!client) return json(401, { ok: false, error: "unauthorized" });

  if (!(await deps.consumeRateLimit(client.name))) {
    console.warn(`transactional mail: client ${client.name} is rate limited`);
    return json(429, { ok: false, error: "rate_limited" });
  }

  const message = await readSendRequest(request);
  if (!message) return json(400, { ok: false, error: "invalid_body" });

  if (!isAllowedRecipient(client, message.to)) {
    console.warn(
      `transactional mail: client ${client.name} sent to a recipient outside its allowlist`,
    );
    return json(403, { ok: false, error: "recipient_not_allowed" });
  }

  try {
    await deps.send({
      from: senderAddress(client),
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch {
    console.error(`transactional mail: SES send failed for ${client.name}`);
    return json(502, { ok: false, error: "send_failed" });
  }
  console.log(`transactional mail: sent for ${client.name}`);
  return json(202, { ok: true });
}

async function readSendRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/iu.test(contentType)) return undefined;
  const body = await request.text().catch(() => "");
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return undefined;
  }
  try {
    return parseSendRequest(JSON.parse(body));
  } catch {
    return undefined;
  }
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}
