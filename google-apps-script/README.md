# Nexora lead notification pipeline

Every accepted website inquiry is stored in Firestore first. After that write succeeds, the browser calls the same-origin Nexora Node server. The server validates the exact payload and forwards it to the Google Apps Script web app using server-only credentials. Apps Script appends the inquiry to Google Sheets and can use Brevo to send the homeowner confirmation and the internal lead notification.

The Microsoft 365 mailbox `support@nexoraglobal.agency` remains the normal inbox. Brevo handles authenticated outbound transactional delivery when configured, and replies are directed back to the Microsoft mailbox.

## 1. Configure Brevo

1. Create or use the approved Brevo account.
2. Add `nexoraglobal.agency` under the domain-authentication area.
3. Add the DNS records Brevo provides through the DNS manager controlling `nexoraglobal.agency`.
4. Wait until Brevo reports that the domain is authenticated.
5. Register `support@nexoraglobal.agency` as a sender.
6. Create a Brevo API key. Store it only in Apps Script properties; do not put it in the website, Render, Git, logs, or documentation.

Domain authentication improves delivery while leaving incoming email with Microsoft 365.

## 2. Create the spreadsheet and script

1. Create a Google Sheet for Nexora solar leads.
2. Open **Extensions → Apps Script** from that sheet.
3. Replace the editor contents with `Code.gs` from this directory.
4. Open **Project Settings**, enable `appsscript.json`, and replace it with the supplied manifest.
5. In **Project Settings → Script properties**, add these six properties directly:
   - `SPREADSHEET_ID`: the ID between `/d/` and `/edit` in the Sheet URL
   - `SHEET_NAME`: `Solar Leads`
   - `SENDER_EMAIL`: `support@nexoraglobal.agency`
   - `NOTIFICATION_EMAIL`: the private address that should receive lead alerts
   - `WEBHOOK_TOKEN`: a long random value that will also be stored privately on Render
   - `BREVO_API_KEY`: the Brevo transactional API key
6. Save the properties. Do not paste either secret into `Code.gs` or Git.
7. Run `setupNexoraLeadPipeline` once to create or update the headers, then approve only the requested Sheets and external-request permissions.

The setup function initializes the customer-facing reference counter at `S-1001`. Each accepted lead receives the next sequential reference, while the Firebase lead ID remains available internally for duplicate protection. The internal notification omits the full street address and free-text notes; authorized staff can review complete details in Firestore or the connected Sheet.

## 3. Deploy the Apps Script web app

1. Select **Deploy → New deployment → Web app**.
2. Set **Execute as** to yourself.
3. Set access to **Anyone** so the Nexora server can post without an interactive Google sign-in.
4. Deploy and copy the URL ending in `/exec`.

## 4. Configure the Render Web Service

Add these server-side environment variables to the Nexora Render Web Service:

```text
LEAD_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
LEAD_WEBHOOK_TOKEN=the-same-private-value-saved-in-WEBHOOK_TOKEN
```

Do not prefix these variables with `VITE_`. Vite-prefixed values are compiled into the browser bundle. Restart or redeploy the Web Service after saving the environment variables. The server status endpoint reports only whether both values are validly configured; it never returns either value.

The Brevo API key remains private in Apps Script properties and must not be added to Render. The server and Apps Script both validate the closed field schema, and the server applies a per-IP request limit. The Sheet-writing code protects against spreadsheet-formula injection and suppresses duplicate Firebase lead IDs for six hours.

## 5. Test safely

Use the repository's local notification tests first:

```text
node --test tests/notification.test.mjs
```

Those tests use synthetic `.invalid` data and mocked upstream responses. They do not contact Apps Script, Brevo, Firestore, or a homeowner. Do not submit a production inquiry unless a separate test plan and cleanup have been explicitly approved.

Firestore remains the primary stored record if the downstream notification service is temporarily unavailable. Provider quotas and plan limits can change, so confirm current limits in the relevant service dashboards before relying on them operationally.
