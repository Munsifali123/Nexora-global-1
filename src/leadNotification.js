const WEBHOOK_URL = import.meta.env.VITE_LEAD_WEBHOOK_URL;
const WEBHOOK_TOKEN = import.meta.env.VITE_LEAD_WEBHOOK_TOKEN;

export async function sendLeadNotification(lead) {
  if (!WEBHOOK_URL) {
    console.info('Lead notification webhook is not configured; the lead remains safely stored in Firestore.');
    return;
  }

  const payload = new URLSearchParams({
    token: WEBHOOK_TOKEN || '',
    payload: JSON.stringify(lead),
  });

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: payload.toString(),
    keepalive: true,
  });
}
