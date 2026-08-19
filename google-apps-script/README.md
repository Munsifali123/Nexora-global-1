# Nexora internal lead-notification pipeline

Every accepted inquiry is stored in Firestore first. The browser never sends the canonical lead to the notification endpoint. It sends only:

```json
{"leadId":"the-Firebase-document-ID"}
```

The Node Web Service uses Firebase Admin to load and validate the canonical inquiry. A PII-free Firestore job keyed by the same `leadId` persists notification state, attempts, due time, lease data, generic error codes, and delivery timestamps. The running Web Service drains due work immediately and at a short interval, then forwards the canonical lead to Apps Script over the server-only webhook.

Apps Script maintains one private Sheet row per `leadId`, assigns a stable `S-####` reference, and sends one internal operational alert through Brevo. It does not email the homeowner. A script lock serializes duplicate requests, while persistent Sheet status and Brevo idempotency protect retries.

## 1. Configure Brevo

1. Use the approved Nexora Brevo account.
2. Authenticate `nexoraglobal.agency` with the DNS records supplied by Brevo.
3. Register `support@nexoraglobal.agency` as an approved transactional sender.
4. Create a transactional API key and store it only in Apps Script properties.

The Brevo request puts the deterministic UUID-style value in the transactional JSON payload's `headers.Idempotency-Key`. No customer-confirmation email is sent.

## 2. Configure the Sheet and Apps Script

1. Create or open the private Google Sheet used for Nexora solar inquiries.
2. Open **Extensions > Apps Script**.
3. Replace the editor contents with `Code.gs` from this directory.
4. In **Project Settings**, enable `appsscript.json`, then use the supplied manifest.
5. In **Project Settings > Script properties**, configure exactly these six properties:
   - `SPREADSHEET_ID`: the identifier between `/d/` and `/edit` in the private Sheet URL
   - `SHEET_NAME`: normally `Solar Leads`
   - `SENDER_EMAIL`: the Brevo-approved sender, normally `support@nexoraglobal.agency`
   - `NOTIFICATION_EMAIL`: the private internal mailbox that receives lead alerts
   - `WEBHOOK_TOKEN`: a long random secret also stored privately on Render
   - `BREVO_API_KEY`: the Brevo transactional API key
6. Do not place either secret in source, Git, browser code, logs, documentation, or any `VITE_` variable.
7. Run `setupNexoraLeadPipeline` once and approve only the requested Sheet and outbound-request permissions.

`NOTIFICATION_EMAIL` is mandatory and has no hardcoded private-address fallback. Setup appends `Notification Status` and `Notified At` to a compatible existing Sheet without deleting rows. The private Sheet may retain the full canonical record. The email intentionally excludes the street address, notes, consent text, click IDs, electricity answers, shade answers, and financing answers. Sheet-bound values are protected against formula injection.

## 3. Deploy the Apps Script web app

1. Select **Deploy > Manage deployments**.
2. Edit the web-app deployment or create a new **Web app** deployment.
3. Set **Execute as** to yourself.
4. Set access to **Anyone** so the authenticated Nexora server can call it without an interactive Google sign-in.
5. Deploy a new version and copy the final URL ending in `/exec`.

Saving editor code alone does not update a versioned web app.

## 4. Configure Firebase Admin on Render

Create a dedicated Firebase Admin credential with only the access required by this notification worker. Do not commit or paste its JSON into an environment-variable value.

In the Render Web Service:

1. Add a secret file named `firebase-admin.json` containing the credential JSON.
2. Confirm its runtime path is `/etc/secrets/firebase-admin.json`.
3. Configure these server-only environment variables:

```text
LEAD_NOTIFICATION_ENABLED=true
FIREBASE_PROJECT_ID=the-production-Firebase-project-ID
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-admin.json
LEAD_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
LEAD_WEBHOOK_TOKEN=the-same-private-value-as-WEBHOOK_TOKEN
```

All five values are server-only. Do not prefix any with `VITE_`. The Brevo API key remains only in Apps Script.

The status endpoint reports only whether the notification runtime initialized; it does not disclose credentials.

## 5. Persistent delivery and retry behavior

The inquiry write and initial PII-free notification job are created together in Firestore. The same-origin endpoint accepts only an exact `{ leadId }` request. Firebase Admin then verifies the canonical inquiry before the queue can deliver it.

The queue uses Firestore transactions and expiring leases so a process interruption does not lose due work. Failed delivery receives a bounded exponential retry, and a later Web Service process can reclaim an expired lease. Apps Script must acknowledge `ok: true`, the matching `leadId`, a stable `referenceNumber`, and a Boolean `duplicate` result.

No paid Render Cron service was added. The existing Web Service starts the worker, drains immediately, wakes periodically while running, and is also kicked after an accepted enqueue request.

## 6. Test safely

Run local mocked tests first:

```text
node --test tests/appsScriptNotification.test.mjs
npm test
```

The tests use `.invalid` data and injected local fakes. They do not call Apps Script, Brevo, Firestore, or a homeowner.

For an explicitly approved end-to-end test, use a synthetic fixture whose name starts with `SYNTHETIC TEST` or whose consent version contains `synthetic`. The internal email subject is prefixed `SYNTHETIC TEST`, followed by an em dash. Verify:

- The endpoint request contains only `leadId`.
- Apps Script returns the matching `leadId` and a stable reference.
- The private Sheet has exactly one row for that lead.
- `Notification Status` is `delivered` and `Notified At` is populated.
- The internal mailbox receives one minimal alert.
- Replaying the same lead returns the same reference without another email.
- The synthetic inquiry and PII-free job are removed under the approved cleanup plan.

If delivery remains unavailable, Firestore is still the primary inquiry record and the PII-free job remains available for retry. Never include production lead data or secrets in test output.
