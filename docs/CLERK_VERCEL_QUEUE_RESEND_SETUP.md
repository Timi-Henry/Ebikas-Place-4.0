# Clerk, Vercel Queue, and Resend setup

The current deployment uses:

- Clerk for authentication and signed user-lifecycle webhooks.
- MongoDB for users, orders, inventory, notification state, and the durable outbox.
- Vercel Queue for immediate delivery of opaque background-job IDs.
- Resend for welcome, customer-order, and admin-order email.

Inngest and Brevo are no longer used by the application.

## 1. Configure Resend

1. Create or sign in to your Resend account at [resend.com](https://resend.com).
2. Buy or use a domain you own. Resend does not provide a free domain, and Gmail cannot be used as the `From` domain for arbitrary customers.
3. Open **Domains > Add Domain**, enter the domain (or a sending subdomain such as `mail.yourdomain.com`), and add every DNS record Resend shows at the DNS provider that controls the domain.
4. Wait until the Resend domain status is **Verified**.
5. Open **API Keys > Create API Key**. Prefer sending-only access restricted to the verified domain when the dashboard offers that scope.
6. Add these values locally and in the production host:

   ```dotenv
   RESEND_API_KEY=re_your_api_key
   RESEND_FROM_EMAIL=orders@yourdomain.com
   RESEND_FROM_NAME=Ebika's Place
   ORDER_ADMIN_EMAIL=ebikasplace@gmail.com
   ```

The `orders@yourdomain.com` address does not need a paid mailbox just to send through Resend. The application uses the Gmail admin address as the reply address where appropriate. If you want to receive mail directly at `orders@yourdomain.com`, configure forwarding or a mailbox separately.

For testing before buying a domain, Resend's `resend.dev` sender can only deliver to the email address attached to your Resend account. It cannot send customer order or welcome messages to arbitrary recipients.

Resend's current Free plan includes 3,000 emails per month and 100 per day. One order consumes two emails (customer and admin); a welcome message consumes one. The application sends the two order messages in one batch API request, but both still count toward the email quota.

## 2. Create the direct Clerk webhook

1. Deploy the application so this URL exists:

   ```text
   https://YOUR_DOMAIN/api/webhooks/clerk
   ```

2. Open **Clerk Dashboard > Production instance > Webhooks**.
3. Select **Add Endpoint** and enter the URL above. Do not choose the Inngest transformation template.
4. Subscribe to exactly:

   - `user.created`
   - `user.updated`
   - `user.deleted`

5. Create the endpoint, open it, and copy its signing secret. It begins with `whsec_`.
6. In the production host's environment-variable settings, add:

   ```dotenv
   CLERK_WEBHOOK_SIGNING_SECRET=whsec_the_secret_from_this_endpoint
   ```

7. Redeploy. Use only the `CLERK_WEBHOOK_SIGNING_SECRET` name.
8. Use Clerk's **Testing** tab to send all three events. A valid delivery returns `200`; an invalid signature returns `400`; a temporary database or queue failure returns `500` so Clerk retries.
9. After this direct endpoint succeeds, disable or delete the old Clerk-to-Inngest endpoint to prevent duplicate lifecycle events.

The app verifies Clerk's signature before reading or mutating user data. Creation and updates reject stale revisions; deletion writes a pseudonymous tombstone that prevents a late create/update event from restoring an account.

## 3. Current Vercel background delivery

Vercel Queue is configured in `vercel.json` and authenticates through the deployment's short-lived OIDC identity. It needs no queue secret in `.env.local`.

Vercel's Hobby plan is explicitly personal/non-commercial. If this store remains hosted on Vercel for real customer orders, upgrade the production team to Pro. Moving only email or queue processing elsewhere does not make a commercial storefront on Hobby compliant.

1. Redeploy after the queue configuration is committed.
2. In Vercel, confirm topic `store-background-jobs-v1` has one consumer.
3. Confirm the consumer appears as a private queue trigger rather than a public webhook.
4. The configuration permits two concurrent jobs and twelve deliveries. Mongo leases protect concurrent processing, and Resend's deterministic idempotency key deduplicates ambiguous retries during Resend's documented 24-hour retention window.
5. Locally, link Vercel CLI/OIDC only when testing real queue publication. Pure workflow tests need no queue credentials.

If production moves to Netlify, replace this adapter with a Netlify Background Function and replace the two Vercel cron entries with Netlify Scheduled Functions before changing DNS. Netlify's current Free plan permits commercial projects, but has a hard 300-credit monthly limit and no service-level commitment. The Mongo outbox and provider-neutral processors are intentionally reusable.

## 4. Recovery and observability

- Immediate failures are retried by the queue adapter with bounded application backoff.
- After four immediate attempts, a job returns to Mongo recovery rather than remaining a poison message.
- `/api/internal/background-jobs` performs a bounded daily recovery sweep and is protected by `CRON_SECRET`.
- The same `CRON_SECRET` protects daily product-media cleanup.
- Mongo `background_jobs` records show `pending`, `publishing`, `published`, `processing`, `retryable`, `completed`, or `dead`. Total attempts are capped at twelve and terminal records expire after 30 days.

If an email is missing, inspect the queue/background-function logs, the matching Mongo job, and Resend email logs. An admin may `POST` the opaque envelope `{ "v": 1, "type": "job", "jobId": "..." }` to `/api/admin/background-jobs/replay` to reopen a `dead` job after fixing its cause. Completed or active jobs cannot be replayed.

## 5. Production verification

1. Confirm `/api/health` and `/api/readiness` return `200`.
2. Create a disposable Clerk user. Confirm the mirror record and exactly one welcome email.
3. Change the user's name/email. Confirm the mirrored profile changes without another welcome email.
4. Delete the user. Confirm the profile and saved addresses are removed and retained commerce relationships are pseudonymized.
5. Place a disposable order. Confirm inventory decreases immediately and exactly two order emails appear in Resend logs.
6. Retry the same checkout idempotency key. Confirm no stock or email duplication.
7. Confirm both daily maintenance invocations succeed.

After the cutover:

- Remove `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, and `INNGEST_DEV`.
- Remove the unused `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME`.
- Revoke the old Brevo key, especially because it was previously pasted into chat.
- Rotate any Clerk, Inngest, or email credentials previously exposed in chat or logs.

Official references: [Clerk webhook verification](https://clerk.com/docs/reference/backend/verify-webhook), [Clerk data synchronization](https://clerk.com/docs/guides/development/webhooks/syncing), [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction), [Resend test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Vercel Hobby terms](https://vercel.com/legal/terms), [Netlify Free commercial use](https://www.netlify.com/blog/introducing-netlify-free-plan/), and [Netlify credit pricing](https://www.netlify.com/pricing/).
