# YoriOTP Panel

A responsive Next.js dashboard for authorized SMS testing and temporary-inbox workflows through NumberPanel. The provider API key is used only by server-side route handlers. There are no credits, wallets, subscriptions, payment flows, or daily usage quotas.

## Requirements

- Node.js 22 (Node 20.9+ is required by Next.js 16; Node 22 is recommended)
- npm 10+
- A PostgreSQL database with TLS for hosted deployments
- A Clerk application with **Google OAuth as the only enabled sign-in strategy**
- A NumberPanel API key

## Local setup

1. Install packages:

   ```bash
   npm install
   ```

2. Copy the placeholder file and replace values locally. `.env.local` is ignored by Git:

   ```bash
   cp .env.example .env.local
   ```

   Never commit `.env.local`, provider credentials, Clerk secret keys, or a production database URL.

3. Configure Clerk (see **Google OAuth-only setup** below), then set the Clerk keys in `.env.local`.

4. Set `NUMBERPANEL_API_KEY` to the NumberPanel key. It must be server-side only; do not add a `NEXT_PUBLIC_` prefix.

5. Set `DATABASE_URL` to a durable PostgreSQL database, then initialize the ownership and rate-limit tables:

   ```bash
   npm run db:setup
   ```

6. Sign in once with Google, copy the resulting Clerk `user_...` ID from Clerk Dashboard → Users, and set it as `OWNER_CLERK_USER_ID`. This controls the owner-only `/admin` route and is evaluated on the server.

7. Start the app:

   ```bash
   npm run dev
   ```

The marketing home and sign-in setup notice render without secrets. Dashboard and API actions fail closed until Clerk, PostgreSQL, and the provider key are configured.

## Google OAuth-only setup in Clerk

The application starts Clerk's `oauth_google` strategy directly and offers no email/password, email-code, email-link, phone, or other sign-in UI. **Clerk Dashboard settings are also required**; a frontend button alone cannot disable strategies at the identity provider.

1. Create a Clerk application and enable Google as a sign-in and sign-up option.
2. In Clerk Dashboard → Configure → Authentication / Sign-in options, disable every other sign-in strategy, including email/password, email verification codes, email links, phone, passkeys, and other social providers.
3. Configure the Google connection in Clerk. You can use Clerk's development OAuth connection for local development, or add your own Google OAuth client in Clerk's Google connection settings.
4. If using a custom Google OAuth client, use the authorized redirect URI displayed by Clerk for that connection. Clerk handles the Google callback; the application callback after the Clerk flow is `/sso-callback`.
5. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-in` keeps account creation on the same Google-only flow.
6. Add the hosted app's origin in Clerk's allowed origins/redirect configuration as directed by the Clerk Dashboard.

The application uses environment variable values from `.env.example`; no Google client secret belongs in this repository. Google OAuth credentials, when using a custom connection, are configured in Clerk rather than shipped to browser code.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk browser publishable key |
| `CLERK_SECRET_KEY` | Yes | Server-side Clerk authentication |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Recommended | Set to `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Recommended | Set to `/sign-in` so new users also use Google OAuth |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Optional | Suggested post-sign-in destination (`/dashboard`) |
| `NUMBERPANEL_API_KEY` | Yes | Single shared provider key; server-only secret |
| `NUMBERPANEL_API_BASE_URL` | Optional | Defaults to `https://numberpanel.tech`; the server rejects other hosts |
| `DATABASE_URL` | Yes | Durable PostgreSQL connection for resource ownership and request throttling |
| `OWNER_CLERK_USER_ID` | Yes for owner tools | Server-side Clerk user ID allowed to open `/admin` |

`.env.example` contains placeholder values only. Use the host's secret manager for deployed environments.

## Data isolation and shared-provider limitation

NumberPanel's documented `my_numbers`, `my_otps`, and mail-history routes are scoped to a **provider API key/account**, not to a Clerk user. This app therefore maintains an ownership ledger in PostgreSQL:

- A number allocation is linked to the authenticated Clerk user before it is returned to the browser. Active phone-number leases are globally unique in YoriOTP.
- OTP polling and release use an internal YoriOTP session UUID, then verify ownership server-side. Before polling/release, the server re-checks `my_numbers` and compares its provider assignment timestamp with the local lease (five-second tolerance). A missing timestamp fails closed; a changed assignment closes the old local lease without releasing or returning a new renter's data.
- Account-wide provider number/history responses are filtered against the ledger. OTP history re-checks current assignments too; when a number has been reassigned, YoriOTP caps the previous lease's history window before the new provider assignment. Latest-OTP and history responses are constrained to the locally recorded lease window. If a timestamp is absent or predates the current lease, the code is hidden.
- Temporary addresses are linked to the creating user. The provider's account-wide mail list is filtered locally; message retrieval requires an owned mailbox UUID and a current match in the provider list. Mailbox ownership rows are retained because the provider has no documented release endpoint. NumberPanel does not document mailbox assignment timestamps or address-reuse semantics, so YoriOTP cannot detect if the same address is reassigned while it remains listed. Do not use temporary inboxes for sensitive messages.
- Existing provider resources created outside YoriOTP have no trustworthy local owner record and are hidden from standard users.
- `/admin` is guarded by `OWNER_CLERK_USER_ID` on the server and reports aggregate ledger counts/configuration only. It does not return the API key or raw OTP/mail content.

The database retains number-session metadata and mailbox addresses as an ownership/history ledger; the app has no self-service deletion flow. OTP and email message bodies are fetched on demand and are not written to this database.

This is **application-level isolation, not provider-level tenancy**. The NumberPanel account and credentials remain shared upstream. The provider controls delivery, account-wide data, and number reuse. Do not launch a public multi-user instance until the owner accepts this limitation and the ownership database is durably backed up. A database outage fails closed for provider actions.

## Provider contract notes

See [`docs/PROVIDER_LIMITATIONS.md`](docs/PROVIDER_LIMITATIONS.md) for the endpoint matrix and documentation gaps. The app implements the 11 routes in the API Playground relevant to number/OTP and temporary mail workflows. It does not call the separate `/api/keys/create`, `/api/keys/current`, or `/api/keys/revoke` routes: their auth and response schemas are undocumented, and operating on the server's single shared key from the app would be unsafe.

The mail API response schemas are not documented. The integration accepts recognizable response arrays/fields and reports a provider contract error if it cannot identify the result; it does not replace an unexpected response with sample data. An actual NumberPanel key is needed to validate mail-domain, generate, history, and message payloads end-to-end.

## Built-in request throttles

The app applies PostgreSQL-backed fixed-window limits per authenticated Clerk user and action. They are **short-window abuse controls, not daily quotas**:

- Inventory: 60/minute
- Number request: 8/minute
- Active number list: 30/minute
- OTP polling: 20/minute (the UI polls one selected session at a 5-second interval and pauses when hidden)
- OTP history: 10/minute
- Number release: 10/minute
- Mail domains: 30/minute
- Mail generation: 8/minute
- Mail history/messages: 20/minute

NumberPanel documents a 1,000/minute number-request limit, no enforced OTP-poll limit (with 2–5 second guidance), and five-second caching for public inventory. The app uses lower per-user limits to protect the shared provider account. Upstream `429`, `500`, and `503` responses are surfaced with safe messages and a `Retry-After` header where applicable.

## Commands

```bash
npm run dev       # Local development server
npm run lint      # ESLint
npm run typecheck # TypeScript check
npm test          # Provider normalization / lease-window tests
npm run build     # Production build
npm run db:setup  # Create PostgreSQL tables and indexes
npm start         # Start the production server
```

No authenticated provider integration test can run without credentials and a provisioned PostgreSQL database. Unit tests use the published API examples and do not provide fake runtime inventory.

## Deployment

Deploy as a Node.js Next.js application (not static export). Provide Node 22, a durable PostgreSQL database, all required Clerk/provider/owner secrets, and run `npm run db:setup` once per database before serving traffic. Then build and start with `npm run build` and `npm start`, or use a Next.js-compatible managed platform. Set Clerk's production origin and Google OAuth connection in Clerk Dashboard. Keep `.env.local` untracked for local development and use deployment secret storage in production.
