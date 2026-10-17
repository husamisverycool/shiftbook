# Research — the forwarding address for timesheets (slice y)

Read live on 2026-10-17. Sources are the products' own documentation.

## 1. Resend Receiving (inbound email)

Source URLs:
- https://resend.com/docs/dashboard/receiving/introduction
- https://resend.com/docs/dashboard/receiving/create-receiving-webhook
- https://resend.com/docs/api-reference/emails/retrieve-received-email
- https://resend.com/docs/api-reference/emails/list-received-email-attachments
- https://resend.com/docs/knowledge-base/forward-emails-with-resend-inbound

Findings:
- Resend "processes all incoming emails to your receiving domain, parses the contents and attachments,
  and then sends a POST request to an endpoint that you choose". The event is `email.received`.
- "Any email sent to any username at your receiving domain will be received by Resend and forwarded to
  your webhook. You can intelligently route based on the `to` field" — so one domain serves every
  agency, each with its own address.
- The event payload (`data`): `email_id`, `created_at`, `from`, `to[]`, `cc[]`, `bcc[]`,
  `received_for[]`, `message_id`, `subject`, `attachments[]` (`id`, `filename`, `content_type`,
  `content_disposition`, `content_id`).
- "Webhooks do not include the email body, headers, or attachments, only their metadata. You must call
  the Received emails API or the Attachments API to retrieve them. This design choice supports large
  attachments in serverless environments."
- `GET /emails/receiving/:email_id` returns `from`, `to`, `subject`, `html`, `text`, `headers`,
  `received_for`, `message_id`, `attachments[]` (with `size`) and `authentication` — "The SPF, DKIM,
  and DMARC results computed when the email was received. These come from the receiving mail server,
  not from the message headers, so the sender cannot forge them" (`pass` | `fail` | `gray` | …).
- `GET /emails/receiving/:email_id/attachments` returns each attachment with `size`,
  `content_disposition`, a signed `download_url` (on `inbound-cdn.resend.com`) and `expires_at`.
- Resend stores received emails even when the webhook is down, so a 5xx from the endpoint is retried
  rather than lost.

## 2. Webhook signatures (Svix, which Resend uses)

Source URLs:
- https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests
- https://docs.svix.com/receiving/verifying-payloads/how-manual

Findings (verbatim where quoted):
- Headers `svix-id` ("the same when the same webhook is being resent"), `svix-timestamp` (seconds),
  `svix-signature` ("list of signatures (space delimited)", each "v1,<base64>").
- "The content to sign is composed by concatenating the id, timestamp and payload, separated by the
  full-stop character"; "body is the raw body of the request".
- "HMAC the signed_content … using the base64 portion of your signing secret (this is the part after
  the `whsec_` prefix) as the key", SHA-256, base64 digest.
- "use a constant-time string comparison"; compare the timestamp "against your system timestamp and
  make sure it's within your tolerance in order to prevent timestamp attacks" (the Svix libraries use
  five minutes). Headers may be white-labelled with a `webhook-` prefix.

## 3. The screen: forwarding receipts to an address

Source URLs:
- https://support.ramp.com/how-to-automatically-forward-receipts-to-ramp
- https://support.ramp.com/submitting-receipts-memos-and-accounting-for-your-ramp-transactions
- https://support.ramp.com/troubleshooting-transaction-receipt-matching
- Expensify's receipts-by-email address beside its upload: not fetched this time (unverified).

Findings:
- Ramp gives one address to forward to and, in Profile settings › **Receipt forwarding**, a list of
  "the email address that will send receipts", with a plus icon to add another ("Profile settings
  showing the Ramp account and additional addresses under Receipt forwarding. The plus icon adds
  another receipt forwarding email"). Ramp identifies the sender from that list.
- Ramp tells people to forward the original email and to save the address in their contacts; a
  receipt that does not attach is reviewed, not silently dropped.
- Expensify shows a receipts address beside its upload (from earlier research; unverified today).

## How Granite uses it (decision 0042)

- One inbound domain; per agency `timesheets+<token>@<domain>` (routing on `to`/`received_for`).
- The address and its accepted senders laid out as Ramp's Receipt forwarding; the address repeated beside
  Convert timesheets' upload, as Expensify does; each email that arrived listed with what happened.
- Sender proof from Resend's `authentication.dmarc`, not from the From header.
- Signature, replay window and idempotency (one row per `email_id`) as above.
