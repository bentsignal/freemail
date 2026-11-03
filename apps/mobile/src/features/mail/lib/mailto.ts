const MAILTO_SCHEME = /^mailto:/iu;

type RecipientHeader = "bcc" | "cc" | "to";
type TextHeader = "body" | "subject";

export function isMailtoUrl(url: string) {
  return MAILTO_SCHEME.test(url);
}

function isRecipientHeader(name: string): name is RecipientHeader {
  return name === "to" || name === "cc" || name === "bcc";
}

function isTextHeader(name: string): name is TextHeader {
  return name === "subject" || name === "body";
}

// RFC 6068 encodes a space as %20 and leaves "+" literal, so URLSearchParams,
// which turns "+" into a space, would corrupt addresses like a+b@example.com.
function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseMailto(url: string) {
  const rest = url.replace(MAILTO_SCHEME, "");
  const queryStart = rest.indexOf("?");
  const path = queryStart === -1 ? rest : rest.slice(0, queryStart);
  const query = queryStart === -1 ? "" : rest.slice(queryStart + 1);

  const fields = new Map<RecipientHeader | TextHeader, string>();
  function addRecipients(header: RecipientHeader, value: string) {
    const recipients = decode(value).trim();
    if (!recipients) return;
    const existing = fields.get(header);
    fields.set(header, existing ? `${existing}, ${recipients}` : recipients);
  }

  addRecipients("to", path);
  for (const pair of query.split("&")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const name = decode(pair.slice(0, separator)).toLowerCase();
    const value = pair.slice(separator + 1);
    if (isRecipientHeader(name)) {
      addRecipients(name, value);
    } else if (isTextHeader(name) && !fields.has(name)) {
      fields.set(name, decode(value).replace(/\r\n?/gu, "\n"));
    }
  }
  return Object.fromEntries(fields);
}

export function mailtoComposeHref(url: string) {
  const query = Object.entries(parseMailto(url))
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? (`/compose?${query}` as const) : ("/compose" as const);
}

type ComposeHref = ReturnType<typeof mailtoComposeHref>;
let heldComposeHref: ComposeHref | undefined;

export function holdComposeHref(href: ComposeHref) {
  heldComposeHref = href;
}

export function takeHeldComposeHref() {
  const href = heldComposeHref;
  heldComposeHref = undefined;
  return href;
}
