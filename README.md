# YoriOTP Panel

A responsive Next.js dashboard for authorized SMS testing and temporary-inbox workflows through NumberPanel. The provider API key is used only by server-side route handlers. There are no credits, wallets, subscriptions, payment flows, or daily usage quotas.

## Requirements

- Node.js 22 (Node 20.9+ is required by Next.js 16; Node 22 is recommended)
- npm 10+
- A durable Turso (libSQL) database and auth token for hosted deployments
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

   Never commit `.env.local`, provider credentials, Clerk secret keys, database auth tokens, or a production database URL.

3. Configure Clerk (see **Google OAuth-only setup** below), then set the Clerk keys in `.env.local`.

4. Set `NUMBERPANEL_API_KEY` to the NumberPanel key. It must be server-side only; do not add a `NEXT_PUBLIC_` prefix.

5. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for a durable Turso database. **The ownership and rate-limit tables are created automatically** the first time the app touches the database (or when `/api/health` is requested), so no manual migration step is needed:

   ```bash
   npm run db:setup  # optional: applies the same migrations by hand
   ```

   The setup command loads `.env.local` using Next.js environment loading. Exported shell variables take precedence. Automatic and manual migration share drizzle's `__drizzle_migrations` journal, so running `db:setup` before or after the app starts is always a safe no-op. Set `DATABASE_AUTO_MIGRATE=false` if you want migrations applied exclusively by hand. For local-only development, set `TURSO_DATABASE_URL=file:local.db` and leave the token empty; local database files are ignored by Git. Never use an ephemeral local file for a hosted multi-instance deployment. Hosted deployments must use the remote Turso database, not an embedded replica, so ownership and rate-limit writes share one durable authority.

6. Sign in once with Google, copy the resulting Clerk `user_...` ID from Clerk Dashboard → Users, and set it as `OWNER_CLERK_USER_ID`. This controls the owner-only `/admin` route and is evaluated on the server.

7. Start the app:

   ```bash
   npm run dev
   ```

The marketing home and sign-in setup notice render without secrets. Dashboard and API actions fail closed until Clerk, Turso, and the provider key are configured.

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
| `TURSO_DATABASE_URL` | Yes | Server-only Turso URL (`libsql://…`); local development may use `file:local.db` |
| `TURSO_AUTH_TOKEN` | Yes for hosted Turso | Server-only Turso auth token; optional for local `file:` databases. It must have write access so the app can create its own tables |
| `DATABASE_AUTO_MIGRATE` | Optional | Defaults to enabled; set to `false` to apply migrations only with `npm run db:setup` |
| `OWNER_CLERK_USER_ID` | Yes for owner tools | Server-side Clerk user ID allowed to open `/admin` |

`.env.example` contains placeholder values only. Use the host's secret manager for deployed environments.

## Data isolation and shared-provider limitation

NumberPanel's documented `my_numbers`, `my_otps`, and mail-history routes are scoped to a **provider API key/account**, not to a Clerk user. This app therefore maintains an ownership ledger in Turso:

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

The app applies Turso-backed fixed-window limits per authenticated Clerk user and action. They are **short-window abuse controls, not daily quotas**:

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
npm test          # Provider normalization plus local libSQL ownership/schema/rate-limit/import tests
npm run build     # Production build
npm run db:setup  # Optional: apply versioned Turso migrations by hand (also reads .env.local)
npm run db:generate # Generate a migration after changing db/schema.ts (also refreshes db/embedded-migrations.ts)
npm run db:embed  # Regenerate db/embedded-migrations.ts, the copy the app applies at runtime
npm run db:embed:check # Fail if db/embedded-migrations.ts is out of date
npm run db:check  # Check migration metadata
npm run db:import -- /secure/path/ledger.json # One-time existing-ledger import
npm start         # Start the production server
```

Database tests apply the committed migrations against temporary local libSQL files using the same client and ORM as production. Provider unit tests use the published API examples and do not provide fake runtime inventory. Local libSQL verification is not live Turso testing: hosted authentication, connectivity and authenticated Clerk/NumberPanel end-to-end flows require real credentials.

## Database schema and existing-data cutover

`db/schema.ts` defines all five ledger tables. Versioned SQL and Drizzle snapshots live in `db/migrations`, and `db/embedded-migrations.ts` is the generated copy the running app applies (a serverless deployment cannot read the migration folder from disk). The app applies pending migrations **automatically**: once per server instance before its first database operation, and whenever `/api/health` or Dashboard → Settings probes readiness. It records them in the same `__drizzle_migrations` journal as `db:setup`, so automatic and manual migration are both safe to rerun in any order and never conflict. After `npm run db:generate`, run `npm run db:embed`; `npm test` and `npm run db:embed:check` fail when the embedded copy drifts from `db/migrations`. Review generated SQL before deploying it; do not edit already-applied migrations or run schema-push commands on production.

- Automatic migration only needs the credentials the app already has, but `TURSO_AUTH_TOKEN` must allow writes. If tables still cannot be created, provider endpoints fail closed with `503 database_not_initialized` and `/api/health` reports `tablesInitialized: false` with the reason in `nextSteps`; `npm run db:setup` applies them by hand, and `DATABASE_AUTO_MIGRATE=false` turns the automatic path off entirely.

- UUIDs remain strings and existing IDs are retained. Database defaults generate UUID v4 values for new sessions/mailboxes; UUID lookups remain case-insensitive by canonicalizing route IDs.
- All former timestamp columns are stored as UTC Unix **milliseconds** and mapped to JavaScript `Date` by Drizzle. Existing sub-millisecond timestamp precision rounds to the millisecond precision already used by the application/API.
- Primary keys, nullable fields, unique lease/mailbox relationships, both cascading foreign keys, the nonnegative rate-count check, and all five named indexes (including descending creation order) are preserved.
- Ownership changes use libSQL write transactions; uniqueness conflicts retain the existing `409` responses. Rate limiting uses one atomic database-clock upsert with unchanged windows, limits and `Retry-After` behavior.

For an **existing PostgreSQL deployment**, creating empty Turso tables is not a data migration. Do not switch the application until the ownership ledger is transferred and verified:

1. Back up the source database. Stop all old/new application instances and other writers; keep traffic stopped throughout export/import. Preserve the source backup for rollback.
2. Use the source host's `psql` client (outside application dependencies), with credentials supplied through its secure service/password configuration rather than committed files or command-line URLs. `db/export-ledger.sql` is the only retained source-dialect SQL and exists solely for this one-time cutover. It exports all five tables in a read-only repeatable-read snapshot, preserving IDs, nulls, ownership, history, rate buckets and counts, and converts timestamps to UTC milliseconds:

   ```bash
   umask 077
   mkdir -p .db-transfer
   psql -X -q -A -t -v ON_ERROR_STOP=1 -f db/export-ledger.sql > .db-transfer/ledger.json
   ```

   The JSON is sensitive ownership data and must stay private/untracked. The export is buffered in memory; plan an operator-reviewed chunked transfer for ledgers too large to fit in memory rather than truncating them.

3. Configure the target's `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in local/deployment secret storage, then run:

   ```bash
   npm run db:setup
   npm run db:import -- .db-transfer/ledger.json
   ```

   Import requires an empty migrated target, validates the exact columns/types, inserts parents before children, verifies every row and foreign key, and commits all five tables in one transaction. Any mismatch or constraint violation rolls back; it never uses `INSERT OR REPLACE` or overwrites existing owners. Compare the reported per-table counts to the source. Large transfers must fit Turso transaction duration/size limits; do not resume serving on a failed or incomplete import.

4. On a credentialed staging Turso database, verify migrations twice, number/mailbox isolation between two Clerk users, duplicate allocation conflicts, release/expiration/history windows, owner-only aggregate counts, and rate-limit enforcement across instances. Then perform the reviewed production transfer and resume traffic on the Turso-only deployment. Keep all Clerk/Google OAuth, owner and NumberPanel settings unchanged. Remove old deployment connection variables after cutover.
5. Delete private transfer files when backups are confirmed. If rollback is necessary, stop writers first and reconcile any Turso writes made since cutover before restoring the old deployment; never run both database backends simultaneously.

Source export execution and live hosted Turso verification require operator access and credentials; local tests do not prove those steps succeeded.

## Deployment

Deploy as a Node.js Next.js application (not static export). Provide Node 22, a durable Turso database, and all required Clerk/provider/owner secrets. The deployment creates its own ownership tables on first use — no pre-deploy migration step is required (`npm run db:setup` remains available for manual control). Then build and start with `npm run build` and `npm start`, or use a Next.js-compatible managed platform. Set Clerk's production origin and Google OAuth connection in Clerk Dashboard. Keep `.env.local` untracked for local development and use deployment secret storage in production.

### Vercel checklist (read this if the dashboard loads but numbers/mail show errors)

Sign-in and page shells work without backend secrets, so a successful deploy with failing `/api/provider/*` calls almost always means the deployment's own secrets are missing or its database credentials cannot write — not a code problem. Every provider API call runs through the Turso ownership database first, so one missing step breaks numbers, mail, history, and sessions together.

1. In Vercel Dashboard → Project → Settings → Environment Variables, set for the **Production** environment: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (use **production** Clerk keys — development keys log a telemetry warning and keep Google OAuth in dev mode), `NUMBERPANEL_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `OWNER_CLERK_USER_ID`. Redeploy after changing them.
2. Confirm `TURSO_AUTH_TOKEN` has **write** access to the same Turso database the deployment points to. The app creates the ownership tables by itself on the first database request — opening `/api/health` once right after deploying does it immediately. To migrate by hand instead (or when `DATABASE_AUTO_MIGRATE=false`), run this from your machine with the production values exported (never commit them):
   ```bash
   TURSO_DATABASE_URL='libsql://…' TURSO_AUTH_TOKEN='…' npm run db:setup
   ```
   Both paths share one `__drizzle_migrations` journal, so `db:setup` is safe to rerun before or after the app initialized the database. A read-only token or a database URL pointing somewhere else is the most common cause of a persistent `503 database_not_initialized` on every provider endpoint.
3. Open `https://<your-app>.vercel.app/api/health` (no sign-in needed). Every check should be `true` and `status` should be `"ok"`; `nextSteps` names anything still missing.
4. Sign in and open Dashboard → Settings, which repeats the same checks for the signed-in session.
5. If errors persist, open Vercel Dashboard → Logs and look for the JSON `{"level":"error",...}` lines: they carry the exact `code` (`database_not_initialized`, `database_unavailable`, `provider_not_configured`, `provider_unauthorized`, …) and the failing reason.
