# Ebika's Place

Ebika's Place is a Next.js storefront with Clerk authentication, MongoDB-backed inventory and orders, and Cloudinary product media.

## Local setup

1. Install Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env.local` and replace every placeholder. Never commit `.env.local`.
3. Use MongoDB Atlas or another replica set. Checkout and order cancellation use transactions and will not be reliable on a standalone MongoDB server.
4. Run `npm run dev`, then open `http://localhost:3000`.
5. In another terminal, run `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`. The local app uses `INNGEST_DEV=1` and exposes its functions at `/api/inngest`.

The hosted Clerk connection and Brevo sender setup are documented in [Clerk, Inngest, and Brevo setup](docs/CLERK_INNGEST_BREVO_SETUP.md).

Useful checks:

- `npm run check` runs ESLint, TypeScript, and the test suite.
- `npm audit --omit=dev --audit-level=high` blocks known high-severity production dependency issues.
- `npm run build` validates the production bundle.

## Required production environment

- `NEXT_PUBLIC_SITE_URL`: the canonical HTTPS deployment URL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: production Clerk keys.
- `ADMIN_IDENTIFIERS`: comma-separated Clerk user IDs or email addresses allowed to manage the catalog and orders.
- `MONGODB_URI` and `MONGODB_DB`: an Atlas or replica-set database.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- `CLOUDINARY_UPLOAD_FOLDER`: optional; defaults to the configured product folder.
- `CRON_SECRET`: at least 32 random characters. Vercel sends this as a bearer token to the daily media-cleanup route.
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`: production keys from the Inngest dashboard. Do not set `INNGEST_DEV` in production.
- `BREVO_API_KEY`: a Brevo v3 API key allowed to send transactional email.
- `BREVO_SENDER_EMAIL`: an address on a verified Brevo sender/domain.
- `BREVO_SENDER_NAME`: the display name for transactional email; optional and limited to 70 characters.
- `ORDER_ADMIN_EMAIL`: the inbox that receives new-order notifications. This is separate from `ADMIN_IDENTIFIERS`.

The Clerk-to-Inngest connection is hosted by Clerk and Inngest, so this app does not need a `CLERK_WEBHOOK_SECRET` or a separate Clerk webhook route.

`ENABLE_SAMPLE_CATALOG=true` is for local development only. Production never substitutes sample inventory when the database is unavailable.

## Deployment checks

1. Add the required variables to the Vercel Production environment and redeploy.
2. Confirm `/api/health` returns `200`.
3. Confirm `/api/readiness` returns `200`; a `503` means configuration or MongoDB is unavailable.
4. Sign in with an admin account and test one product image upload, edit, and delete.
5. Sign in with a customer account and test checkout, cancellation, and order history.
6. Confirm the scheduled `/api/internal/media-cleanup` invocation succeeds in Vercel logs.
7. In Inngest, sync `https://YOUR_DOMAIN/api/inngest`, place a test order, and confirm the single `send-order-placed-notification` run sends both emails.
8. Connect Clerk's hosted Inngest webhook, select only `user.created`, `user.updated`, and `user.deleted`, then test create, update, and delete with a disposable Clerk user.
9. Confirm the created user is synchronized and receives one welcome email, the update changes the mirrored profile, and the deletion cleanup completes.

## Order notification usage

Each order transaction persists a pending notification before it commits. The app then emits one lean event containing only the order ID. One Inngest function fetches the private order data, performs one idempotent Brevo API request containing separate customer and admin message versions, and marks the notification sent in a separate durable step. A successful order therefore uses three Inngest executions (one function run plus two steps) and two Brevo email sends. Active concurrency is capped at one and retries are capped at two. Persistent sent state prevents later checkout replays from emailing twice. If an order is cancelled or rejected before delayed recovery, its stale placement email is suppressed.

One twice-daily recovery function requeues only the rare notification event that never reached Inngest. With nothing to recover, it costs four executions per day (about 120/month, or 0.24% of the 50,000-execution Hobby allowance). Accepted function runs use Inngest's own bounded retries and dashboard rather than cycling through the recovery queue forever. The existing media-cleanup schedule remains a Vercel cron. No order-status or abandoned-cart automations are enabled on the free plan.

The CI workflow repeats linting, typechecking, tests, dependency auditing, and a production build on every push and pull request.

## Clerk user lifecycle usage

One Inngest lifecycle function handles the three selected Clerk events. A typical account creation uses about four executions (run, database sync, welcome delivery, and delivery-state write) and one Brevo send. An update uses about two executions, and a deletion uses about two. There is no lifecycle polling or scheduled user job, so quiet accounts consume nothing. These estimates are separate from the twice-daily order-notification recovery above; see the setup guide for a worked free-plan example.
