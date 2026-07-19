# Clerk, Inngest, and Brevo setup

This project uses two Inngest entry points for different purposes:

- The app endpoint at `/api/inngest` publishes the app's functions to Inngest and accepts signed calls from Inngest.
- Clerk's hosted Inngest webhook sends Clerk lifecycle events directly to Inngest. The app does not expose a Clerk webhook route and does not need `CLERK_WEBHOOK_SECRET`.

The lifecycle workflow handles only `user.created`, `user.updated`, and `user.deleted`: it mirrors the minimum user profile, sends one welcome email after creation, and performs account-deletion cleanup. Order emails use the same Brevo provider but remain a separate Inngest workflow.

Deletion removes the mirrored Clerk profile and saved addresses. Orders, reviews, legacy embedded reviews, product-media records, and media-cleanup audit records are retained for fulfillment, accounting, and catalog integrity, but the raw Clerk user ID is replaced with a deterministic pseudonym; order idempotency/request hashes are also removed. Historical order contact and fulfillment snapshots remain available to the admin. A pseudonymous tombstone prevents a late Clerk retry from recreating the deleted profile.

## 1. Configure Brevo

1. Create or open the Brevo account that will send production email.
2. In Brevo's **Senders, Domains & Dedicated IPs** area, add the sending domain. Add the DNS records Brevo shows, then wait until the domain is authenticated. If a full domain is not available yet, verify a single sender for testing.
3. Add `BREVO_SENDER_EMAIL` as a sender on that verified domain. Set `BREVO_SENDER_NAME` to the storefront name.
4. Open **SMTP & API > API Keys**, create a v3 API key for this app, and copy it immediately. Store it only as `BREVO_API_KEY`; do not put it in browser-visible variables or commit it.
5. Choose the admin order inbox for `ORDER_ADMIN_EMAIL`. It may differ from the sender address.
6. Add these variables to `.env.local` for local testing and to the Vercel **Production** environment:

   ```dotenv
   BREVO_API_KEY=xkeysib-your-key
   BREVO_SENDER_EMAIL=orders@your-domain.example
   BREVO_SENDER_NAME=Ebika's Place
   ORDER_ADMIN_EMAIL=owner@your-domain.example
   ```

7. Redeploy after changing Vercel variables. Send the first tests to inboxes you control, and check both delivery and spam folders.

Brevo's Free plan currently allows up to 300 email sends per day. One welcome message is one send. One order makes one Brevo API request with two message versions, but it is still two sends: one customer email and one admin email. Free-plan emails include Brevo's branding; confirm the current allowance in the Brevo account before launch.

## 2. Publish the app functions to Inngest

1. Create or open the Inngest account and select the intended workspace/environment.
2. In Inngest, create or copy an **Event Key** and the app's **Signing Key**.
3. Add the following to Vercel's **Production** environment. Do not define `INNGEST_DEV` in production.

   ```dotenv
   INNGEST_EVENT_KEY=evt_your-event-key
   INNGEST_SIGNING_KEY=signkey-your-signing-key
   ```

4. Deploy the site, then sync the public serve endpoint in Inngest:

   ```text
   https://YOUR_DOMAIN/api/inngest
   ```

5. Confirm the Inngest app shows `send-order-placed-notification`, `recover-pending-order-notifications`, and `handle-clerk-user-lifecycle`. A request to the site's `/api/readiness` endpoint should also return `200`.

`INNGEST_EVENT_KEY` signs events the storefront sends to Inngest, such as an order-created event. `INNGEST_SIGNING_KEY` lets `/api/inngest` verify calls from Inngest. Neither key replaces the hosted Clerk connection in the next section.

## 3. Connect Clerk to Inngest

Use the correct Clerk instance. For this live deployment, choose **Production**. If you connect Clerk's **Development** instance, point it at a separate Inngest account/environment and staging database; Clerk's template creates a cloud webhook in Inngest Production, so connecting both instances to the same deployed app would mix test users into production data.

1. Open **Clerk Dashboard > your instance > Webhooks**.
2. Select **Add Endpoint**.
3. Choose **Transformation template**, then choose **Inngest**.
4. Select **Connect to Inngest**, sign in if prompted, verify that the authorization popup names the intended Inngest account/workspace, and select **Approve**. Clerk creates this hosted webhook in that account's Inngest Production environment.
5. Select exactly these Clerk events:

   - `user.created`
   - `user.updated`
   - `user.deleted`

6. Create the endpoint. Clerk creates a hosted webhook in Inngest's Production environment; there is no webhook URL or Clerk signing secret to add to this repository.
7. In the Inngest webhook settings, edit the transformation so the Clerk payload is forwarded directly and the Svix delivery ID becomes the Inngest event ID:

   ```js
   function transform(evt, headers = {}) {
     const result = {
       name: `clerk/${evt.type}`,
       data: evt.data,
     };

     const svixId = headers["Svix-Id"] || headers["svix-id"];
     if (svixId) result.id = `clerk-${svixId}`;
     if (typeof evt.timestamp === "number") result.ts = evt.timestamp;

     return result;
   }
   ```

8. Save the transformation. The resulting names must be `clerk/user.created`, `clerk/user.updated`, and `clerk/user.deleted`. Keep `data: evt.data` as shown; do not wrap it in `{ user: evt.data }`.

The `clerk-${Svix-Id}` event ID gives repeated delivery attempts a 24-hour Inngest deduplication window. The database operations and email receipt state remain idempotent beyond that window.

## 4. Test locally without duplicating live events

1. Keep the local-only setting in `.env.local`:

   ```dotenv
   INNGEST_DEV=1
   ```

2. Start Next.js:

   ```powershell
   npm run dev
   ```

3. In a second terminal, start Inngest's development server and explicitly point it at this app:

   ```powershell
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```

4. Open the local Inngest development UI and send a sample transformed event, for example `clerk/user.created`, with a real Clerk-shaped `data` object and an email address you control.
5. Confirm the user mirror is created and exactly one welcome email arrives. Then send `clerk/user.updated` for the same ID and confirm the mirror changes. Finally send `clerk/user.deleted` and confirm the cleanup run completes.

The Clerk transformation template creates a webhook in Inngest **Production**. A Clerk dashboard test or actual Clerk event can therefore trigger the cloud workflow even while the local development server is open. For local testing, manually send a sample event through the local Inngest UI instead of replaying a real production delivery. Never set `INNGEST_DEV` in Vercel Production.

## 5. Verify production end to end

1. Create a disposable user in the connected Clerk instance.
2. In Inngest, confirm one `clerk/user.created` event and one lifecycle function run.
3. Confirm the user mirror exists and only one welcome email was delivered.
4. Change the user's name or primary email in Clerk and confirm one `clerk/user.updated` run updates the mirror.
5. Delete the disposable Clerk user and confirm one `clerk/user.deleted` run performs cleanup.
6. Place a disposable order and confirm the order function makes one Brevo request and delivers two emails.
7. Retry/replay only with test recipients. Confirm the persisted delivery state prevents duplicate welcome and order email.

If events appear in Inngest but no function starts, resync `https://YOUR_DOMAIN/api/inngest` and verify the transformed event names. If the function starts but email fails, verify the Brevo API key, authenticated sender, sender address, and Brevo transactional logs.

## Free-plan budget example

The workflow intentionally avoids user polling, per-user schedules, and multi-function fan-out. Typical successful costs are:

| Activity | Inngest executions | Brevo sends |
| --- | ---: | ---: |
| Create one user (sync + welcome + status) | about 4 | 1 |
| Update one user | about 2 | 0 |
| Delete one user | about 2 | 0 |
| Place one order | about 3 | 2 |
| Empty order recovery schedule | about 4/day, about 120/month | 0 |

For example, 100 created users, 100 updates, 25 deletions, and 100 orders in a month use about 950 event-driven Inngest executions, plus about 120 executions for the existing empty recovery checks: roughly 1,070 total. They use about 300 Brevo sends for the month. Brevo's 300-send limit is daily, so bursty order traffic matters more than this monthly example. Both lifecycle and order-delivery functions cap active concurrency and use bounded retries; confirm current plan allowances in both dashboards because provider limits can change.

Official references: [Clerk's Inngest integration](https://clerk.com/docs/guides/development/webhooks/inngest), [Inngest hosted webhooks](https://www.inngest.com/docs/platform/webhooks), [deploying Inngest with Vercel](https://www.inngest.com/docs/deploy/vercel), [Inngest pricing and allowances](https://www.inngest.com/pricing), [Brevo's transactional email API](https://developers.brevo.com/reference/send-transac-email), and [Brevo Free-plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan).
