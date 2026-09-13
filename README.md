# Ebika's Place

Ebika's Place is a Next.js storefront with Clerk authentication, MongoDB-backed inventory and orders, Cloudinary product media, Resend transactional email, and a Mongo-backed durable notification outbox.

## Local setup

1. Install Node.js 22 and run `npm ci`.
2. Copy `.env.example` to `.env.local` and replace every placeholder. Never commit `.env.local`.
3. Use MongoDB Atlas or another replica set. Checkout, account cleanup, and the durable notification outbox use transactions.
4. Link the directory to its Vercel project when testing real queue publication locally: `npx vercel link`, then run the dev server with the project environment via `npx vercel env run -- npm run dev`. Pure workflow tests need no queue credentials.
5. Run `npm run dev`, then open `http://localhost:3000`.

Clerk, Vercel Queue, and Resend setup is documented in [Clerk, Vercel Queue, and Resend setup](docs/CLERK_VERCEL_QUEUE_RESEND_SETUP.md).

Useful checks:

- `npm run check` runs ESLint, TypeScript, and the test suite.
- `npm audit --omit=dev --audit-level=high` checks production dependencies.
- `npm run build` validates the production bundle and Vercel configuration.

## Required production environment

- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS deployment URL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`: production Clerk keys.
- `CLERK_WEBHOOK_SIGNING_SECRET`: signing secret for `/api/webhooks/clerk`.
- `ADMIN_IDENTIFIERS`: Clerk user IDs or email addresses allowed into administration.
- `MONGODB_URI` and `MONGODB_DB`: Atlas or another replica-set database.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and optional `CLOUDINARY_UPLOAD_FOLDER`.
- `CRON_SECRET`: at least 32 random characters for the two private maintenance routes.
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, optional `RESEND_FROM_NAME`, and `ORDER_ADMIN_EMAIL`.

Vercel Queue uses Vercel's short-lived project OIDC identity; it does not require a queue API key. Inngest is not used by this application.

Vercel currently documents Queues as Beta, and its Hobby plan is restricted to personal, non-commercial use. If production stays on Vercel, use Pro before accepting real customer orders.

Netlify currently permits commercial projects on its Free plan and supports modern Next.js, scheduled functions, and background functions. Its Free plan has a hard 300-credit monthly cap, pauses the account's projects when exhausted, and has no service-level commitment. The current immediate-delivery adapter is Vercel Queue-specific, so migrate that adapter to Netlify Background Functions before moving production; the Mongo outbox and notification processors can remain unchanged.

`ENABLE_SAMPLE_CATALOG=true` is for local development only. Production never substitutes sample inventory when the database is unavailable.

## Deployment checks

1. Add the required variables to Vercel Production and redeploy.
2. Confirm `/api/health` and `/api/readiness` return `200`.
3. In Clerk Production, add `https://YOUR_DOMAIN/api/webhooks/clerk` and subscribe only to `user.created`, `user.updated`, and `user.deleted`.
4. Disable the previous Clerk-to-Inngest endpoint after the new Clerk endpoint succeeds once.
5. Place one disposable order and confirm the customer and admin messages in Resend logs.
6. Create, edit, and delete one disposable Clerk user; confirm welcome delivery, database sync, and cleanup.
7. Confirm Vercel shows the `store-background-jobs-v1` consumer and successful scheduled invocations for `/api/internal/media-cleanup` and `/api/internal/background-jobs`.

## Durable notification design

Checkout commits stock, the order, and an opaque notification job in one Mongo transaction. It then publishes only the hashed job ID to a private Vercel Queue consumer. The consumer uses an atomic Mongo lease, bounded retries, and a stable Resend idempotency key, so duplicate queue delivery or a short provider-acknowledgement failure does not intentionally send the same notification twice. Customer and order data never enter the queue payload.

Welcome email uses the same durable path after the direct Clerk webhook synchronizes the user. Clerk update and deletion work runs directly in the signed webhook because Clerk retries failed deliveries and the database operations are timestamp-aware, transactional, and idempotent.

The queue performs immediate retry delivery. A daily authenticated Vercel cron re-publishes pending, retryable, or expired-lease jobs from the Mongo outbox. Total attempts are bounded, terminal records expire after 30 days, and an authenticated admin endpoint can deliberately replay a dead job when its underlying issue is fixed.

The CI workflow repeats linting, typechecking, tests, dependency auditing, and a production build on every push and pull request.
