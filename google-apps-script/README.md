# Free Nexora lead notification pipeline

This replaces Make for the initial campaign. Every website submission remains stored in Firestore. The browser also calls a Google Apps Script web app that appends the lead to Google Sheets and uses Brevo to send the homeowner confirmation and internal lead notification.

The Microsoft 365 mailbox `support@nexoraglobal.agency` remains your normal inbox. Brevo handles authenticated outbound transactional delivery, and replies are directed back to the Microsoft mailbox.

## 1. Configure Brevo

1. Create a free Brevo account.
2. Add `nexoraglobal.agency` under **Senders & IP → Domains**.
3. Add the DNS records Brevo provides through the DNS manager controlling `nexoraglobal.agency`.
4. Wait until Brevo reports that the domain is authenticated.
5. Register `support@nexoraglobal.agency` as a sender.
6. Create a Brevo API key. Do not put this key in the website or Render environment variables.

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
   - `WEBHOOK_TOKEN`: a long random value that will also be used on Render
   - `BREVO_API_KEY`: the Brevo transactional API key
6. Save the properties. Do not paste either secret into `Code.gs` or Git.
7. Run `setupNexoraLeadPipeline` once if you want to create the headers before the first live submission, then approve the requested Sheets and external-request permissions.

The setup function also initializes the customer-facing reference counter at `S-1001`. Each accepted lead receives the next sequential reference, while the website's Firebase lead ID remains available internally for duplicate protection. The API key remains private in Apps Script properties and is never sent to the browser.

## 3. Deploy the web app

1. Select **Deploy → New deployment → Web app**.
2. Set **Execute as** to yourself.
3. Set access to **Anyone** so the public website can submit without requiring the homeowner to sign in.
4. Deploy and copy the URL ending in `/exec`.

## 4. Configure Render

Add these environment variables to the Render static site:

```text
VITE_LEAD_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_LEAD_WEBHOOK_TOKEN=the-same-value-saved-in-WEBHOOK_TOKEN
```

Redeploy after adding them because Vite environment variables are inserted during the production build.

The webhook token discourages casual automated calls but is visible in the built frontend and must not be treated as a server secret. The Brevo API key stays private inside Apps Script. The script also validates fields, prevents spreadsheet-formula injection, uses a lock for concurrent writes, and suppresses duplicate lead IDs for six hours.

## 5. Test safely

Submit one clearly labeled test lead through the production site. Confirm that:

- The lead exists in Firestore.
- A row appears in the `Solar Leads` sheet.
- The homeowner confirmation arrives from `support@nexoraglobal.agency`.
- The internal lead notification arrives at the configured notification email.
- Replying to the confirmation reaches the Microsoft 365 mailbox.

Delete the test data afterward if appropriate.

## Quota note

Brevo currently includes 300 email sends per day on its free plan. Because this workflow sends two messages per lead, that supports up to roughly 150 leads per day before any other Brevo messages. Firestore remains the fallback source of truth if email or Sheets processing fails.
