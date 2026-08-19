export class DeliveryError extends Error {
  constructor(code) {
    super('Lead notification delivery failed.');
    this.name = 'DeliveryError';
    this.code = code;
  }
}

export function leadWebhookConfiguration(env) {
  const webhookUrl = String(env.LEAD_WEBHOOK_URL || '').trim();
  const webhookToken = String(env.LEAD_WEBHOOK_TOKEN || '').trim();
  if (!webhookUrl || !webhookToken) return null;
  try {
    const parsedUrl = new URL(webhookUrl);
    if (parsedUrl.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { webhookUrl, webhookToken };
}

function validAcknowledgement(value, leadId) {
  return Boolean(
    value
    && Object.prototype.toString.call(value) === '[object Object]'
    && value.ok === true
    && value.leadId === leadId
    && typeof value.referenceNumber === 'string'
    && /^S-[A-Za-z0-9-]{1,64}$/.test(value.referenceNumber)
    && typeof value.duplicate === 'boolean'
  );
}

export function createAppsScriptDelivery({ config, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (!config) throw new Error('Lead webhook configuration is required.');

  return async function deliverLead(lead) {
    const body = new URLSearchParams({
      token: config.webhookToken,
      payload: JSON.stringify(lead),
    });

    let response;
    try {
      response = await fetchImpl(config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new DeliveryError('network_error');
    }

    if (!response.ok) throw new DeliveryError('upstream_http_error');

    let result;
    try {
      const text = (await response.text()).trim();
      if (!text) throw new Error();
      result = JSON.parse(text);
    } catch {
      throw new DeliveryError('invalid_acknowledgement');
    }
    if (!validAcknowledgement(result, lead.leadId)) {
      throw new DeliveryError('invalid_acknowledgement');
    }

    return {
      referenceNumber: result.referenceNumber,
      duplicate: result.duplicate,
    };
  };
}
