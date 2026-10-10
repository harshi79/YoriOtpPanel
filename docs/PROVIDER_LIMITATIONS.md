# NumberPanel API integration notes

Reviewed against the linked [API Playground](https://numberpanel.tech/docs), [Developer API reference](https://numberpanel.tech/developers), and read-only public GET endpoints on 2026-10-10. No authenticated mutation was made during implementation; a provider API key was not available in the repository.

## Implemented route mapping

| Upstream route | YoriOTP action | Ownership/auth behavior |
|---|---|---|
| `GET /api/services` | Dashboard service picker and overview | Authenticated YoriOTP route; upstream inventory endpoint itself is public |
| `GET /api/countries?service=...` | Service-specific country picker | Service key checked against current provider service list |
| `POST /api/request_number` | Allocate a number | Server-only Bearer key; only inventory values are accepted; allocation is persisted to the local Clerk-user ledger before the number is returned |
| `GET /api/my_numbers` | Refresh current provider state | Server fetch; returned phone entries are intersected with the local active ownership ledger; undocumented-timestamp OTP fields are not forwarded |
| `GET /api/latest_otp?number=...` | Selected-session polling | Browser supplies an internal UUID; server looks up the owned number; OTP is returned only when `received_at` falls inside that lease |
| `GET /api/my_otps?number=&limit=...` | History | Provider data is filtered by locally owned numbers and their assignment/end-time window; current assignments are re-checked and old history is capped before a detected reassignment; no pagination is available beyond the provider's 1–200 limit |
| `POST /api/release_number` | Release session | Browser supplies an internal UUID; the server verifies the current owner and sends the associated provider number |
| `GET /api/mail/domains` | Domain selector | Server-side Bearer key; an unauthenticated read of this route returned `Unauthorized` during inspection |
| `POST /api/mail/generate` | Create mailbox | Server-side Bearer key; result is recorded to the local owner ledger before the address is returned |
| `GET /api/mail/history` | Owned inbox list | Account-wide result is filtered against locally registered addresses; YoriOTP labels whether an address appears in the current provider response |
| `GET /api/mail/messages?email=...` | Read mailbox | Browser supplies a mailbox UUID; server verifies ownership and current provider-list membership before querying the provider; message bodies render as text, not HTML |

All YoriOTP API actions are behind Clerk authentication, database-backed per-user throttling, request validation, and server-side provider requests. Mutating requests also require a matching request origin.

## Observed public endpoint behavior

- At inspection time, unauthenticated `GET /api/services` returned one current service (`WhatsApp`) with provider inventory data.
- `GET /api/countries?service=whatsapp` returned country objects such as `{ name: "NG", flag: "🇳🇬", count: ... }`. The docs' sample uses full country names, and `request_number` documentation says to pass a country name or `random`. YoriOTP maps two-letter region values to a display/request country name using `Intl.DisplayNames`; this needs a provider-key-backed allocation test before launch.
- An unauthenticated `GET /api/mail/domains` returned an Unauthorized error, so YoriOTP calls it with the server-side Bearer key even though the docs page does not state mail-route auth explicitly.

These are point-in-time observations, not hard-coded inventory or availability guarantees.

## Documentation gaps / excluded routes

- Mail routes have no documented response schemas, per-route auth labels, pagination, assignment timestamps, address-reuse semantics, or retention. YoriOTP requires the owned address to remain in the current provider mail list before fetching messages, but if NumberPanel reuses the same address while it remains listed, there is no documented field to distinguish the new assignment. Do not use temporary inboxes for sensitive messages. The `/temp-email-api` marketing page mentions rich HTML/attachments and a 24-hour window, but those details are not in the linked API contract.
- `/api/keys/create`, `/api/keys/current`, and `/api/keys/revoke` appear on the Developer API page but not the Playground endpoint list and have no auth or request/response schemas. YoriOTP uses one owner-managed environment key and deliberately does not expose key creation, retrieval, or revocation in the app.
- Other site pages mention versioned `/v1/...` rental endpoints, webhooks, or other API shapes. Those are not implemented because they conflict with the linked `/api/...` reference.
- No explicit API route assigns a resource to a Clerk user. `my_numbers`/`my_otps` and temporary-mail history are account/key-scoped. The local database is the app's isolation boundary; the upstream NumberPanel account is still shared.
- The provider returns an OTP timestamp from `/api/latest_otp` and OTP history examples include `timestamp`, but `my_numbers.latest_otp`/`latest_otp_message` have no timestamp. YoriOTP intentionally does not return the latter fields to users; without a timestamp, it cannot distinguish a current OTP from a stale code for a recycled number. Before polling, release, and OTP-history reads, the server re-checks `my_numbers` and requires its assignment timestamp to match the local lease within five seconds. Missing timestamps fail closed; changed leases are retired locally, and historical OTP windows are capped before the new assignment without returning/releasing the new assignment.
- No email-release endpoint is documented. Mailbox owner records are retained to prevent a recycled address from being reassigned to a different YoriOTP user.

## Provider errors and limits

The Developer API reference documents `{ success: false, error: "..." }` errors and status codes `400`, `401`, `429`, `500`, and `503`. It states a request-number limit of 1,000/minute per user, recommends 2–5 second OTP polling, and says the public services/countries routes are cached for five seconds. The limits for the other routes are unspecified. YoriOTP's own lower short-window limits are described in the README.
