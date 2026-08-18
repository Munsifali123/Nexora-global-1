const NOTIFICATION_ENDPOINT = '/api/lead-notification';

export async function sendLeadNotification(lead, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(NOTIFICATION_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
    keepalive: true,
  });

  if (!response.ok) throw new Error('Lead notification could not be delivered.');
  return response.json();
}
