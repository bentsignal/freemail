# Transactional mail

Freemail sends short plain-text emails, such as sign-in codes, for Shawn's
other personal apps through the same Amazon SES credentials that send its
own codes ([AUTH.md](AUTH.md), [PROVIDERS.md](PROVIDERS.md#hosted-mail-amazon-ses)).
It is separate from agent tokens, which still can't send mail.

## Endpoint

`POST https://<CONVEX_SITE_URL>/transactional-mail/send`

```http
Authorization: Bearer <client token>
Content-Type: application/json

{ "to": "shawn@rodgers.dev", "subject": "Your Notes sign-in code", "text": "Your Notes sign-in code is 123456. It expires in 5 minutes." }
```

| Status | Body                                           | When                                               |
| ------ | ---------------------------------------------- | -------------------------------------------------- |
| 202    | `{"ok":true}`                                  | SES accepted the message                           |
| 400    | `{"ok":false,"error":"invalid_body"}`          | not JSON, unknown fields, or a field out of bounds |
| 401    | `{"ok":false,"error":"unauthorized"}`          | missing or unknown token                           |
| 403    | `{"ok":false,"error":"recipient_not_allowed"}` | `to` isn't in the client's allowlist               |
| 429    | `{"ok":false,"error":"rate_limited"}`          | more than 10 a minute for that client              |
| 500    | `{"ok":false,"error":"not_configured"}`        | `TRANSACTIONAL_MAIL_CLIENTS` is malformed          |
| 502    | `{"ok":false,"error":"send_failed"}`           | SES refused or failed                              |

The body takes exactly `to` (one address), `subject` (1 to 200 characters,
no line breaks), and `text` (1 to 5,000 characters). There is no HTML, no
attachments, and no caller-chosen sender. Checks run in this order: token,
rate limit, body, recipient. Logs name the client and the outcome, never the
recipient, subject, or text.

## Clients

`TRANSACTIONAL_MAIL_CLIENTS` is a JSON array, one entry per app:

```json
[
  {
    "name": "notes",
    "tokenSha256": "<sha-256 of the token, hex>",
    "from": "notes@rodgers.dev",
    "fromName": "Notes",
    "to": ["shawn@rodgers.dev"]
  }
]
```

- The token lives only in the calling app. Freemail stores its SHA-256 and
  compares hashes in constant time.
- `from` and `fromName` set the sender (`"Notes" <notes@rodgers.dev>`);
  `from` must be on a domain verified in SES.
- `to` is the client's recipient allowlist, matched case-insensitively.
- `name` is lowercase letters, digits, and dashes, and keys the rate limit.

Unset, nobody is allowed (every request gets 401). To add an app, generate a
token on its side (`openssl rand -base64 32`), hash it
(`printf %s "$TOKEN" | shasum -a 256`), add an entry, and set the variable
again with `pnpm exec convex env set --prod TRANSACTIONAL_MAIL_CLIENTS '<json>'`.
Rotating a token is the same: replace the hash. The code is in
`src/transactionalMail/`.
