import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateEstimate, normalizeEstimateInput, orientationConfig, PVGIS_ENDPOINT } from './src/estimator-core.mjs';
import { PUBLIC_ROUTES } from './src/seo.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 20;
const LEAD_NOTIFICATION_LIMIT = 10;
const LEAD_NOTIFICATION_ATTEMPTS = 3;
const LEAD_NOTIFICATION_RETRY_DELAY_MS = 250;
const LEAD_FIELDS = [
  'leadId', 'name', 'number', 'email', 'address', 'zipCode', 'propertyType',
  'ownership', 'electricBill', 'sunlightExposure', 'timeline',
  'financingInterest', 'description', 'consent', 'consentText',
  'consentVersion', 'leadStatus', 'phoneVerified', 'pageUrl', 'source',
  'createdAt', 'county', 'campaignVariant',
];
const SOURCE_FIELDS = ['internalSource', 'utmSource', 'utmMedium', 'utmCampaign', 'gclid'];
const SOURCE_MAX_LENGTHS = { internalSource: 200, utmSource: 200, utmMedium: 200, utmCampaign: 300, gclid: 512 };
const ALLOWED_LEAD_VALUES = {
  propertyType: ['Single-family home', 'Multifamily property', 'Commercial property', 'Farm or agricultural property', 'Other'],
  ownership: ['I own the property', 'I am authorized to make decisions', 'I am purchasing the property', 'I rent or lease the property'],
  electricBill: ['Under $100', '$100\u2013$200', '$201\u2013$350', '$351\u2013$500', '$500+'],
  sunlightExposure: ['Mostly full sun', 'Some shade', 'Heavy shade', 'Unsure'],
  timeline: ['As soon as possible', 'Within 1\u20133 months', 'Within 3\u20136 months', 'Within 6\u201312 months', 'Just researching'],
  financingInterest: ['Interested in financing', 'Planning to pay cash', 'Not sure yet'],
};
const PAID_COUNTIES = ['Orange County', 'Riverside County', 'San Bernardino County'];

function clientIp(req) { return req.ip || req.socket.remoteAddress || 'unknown'; }
function createRateLimit(requests, limit = LIMIT, message = 'Please wait before trying another estimate.') {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = clientIp(req);
    const recent = (requests.get(ip) || []).filter((value) => now - value < WINDOW_MS);
    if (recent.length >= limit) return res.status(429).json({ error: message });
    recent.push(now);
    requests.set(ip, recent);
    return next();
  };
}

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function hasExactFields(value, fields) {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function hasUnsafeControlCharacters(value, multiline = false) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowedWhitespace = multiline && (code === 9 || code === 10 || code === 13);
    if (code === 127 || (code < 32 && !allowedWhitespace)) return true;
  }
  return false;
}

function validateLeadText(lead, field, minLength, maxLength, { multiline = false } = {}) {
  const value = lead[field];
  if (typeof value !== 'string') throw new Error('Invalid lead field: ' + field);
  const length = value.trim().length;
  if (length < minLength || length > maxLength) throw new Error('Invalid lead field: ' + field);
  if (hasUnsafeControlCharacters(value, multiline)) throw new Error('Invalid lead field: ' + field);
}

export function validateLeadNotificationPayload(lead) {
  if (!isPlainObject(lead) || !hasExactFields(lead, LEAD_FIELDS)) throw new Error('Invalid lead payload.');

  validateLeadText(lead, 'leadId', 8, 128);
  validateLeadText(lead, 'name', 2, 120);
  validateLeadText(lead, 'number', 7, 30);
  validateLeadText(lead, 'email', 5, 254);
  validateLeadText(lead, 'address', 5, 300);
  validateLeadText(lead, 'zipCode', 5, 10);
  validateLeadText(lead, 'description', 0, 2000, { multiline: true });
  validateLeadText(lead, 'consentText', 40, 1000, { multiline: true });
  validateLeadText(lead, 'consentVersion', 8, 50);
  validateLeadText(lead, 'pageUrl', 8, 2048);
  validateLeadText(lead, 'createdAt', 20, 40);
  validateLeadText(lead, 'county', 0, 32);
  validateLeadText(lead, 'campaignVariant', 1, 80);

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(lead.leadId)) throw new Error('Invalid lead ID.');
  if (!/^\+?[0-9() .-]{7,30}$/.test(lead.number)) throw new Error('Invalid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new Error('Invalid email address.');
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(lead.zipCode)) throw new Error('Invalid ZIP code.');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}([._-][A-Za-z0-9]+)?$/.test(lead.consentVersion)) throw new Error('Invalid consent version.');
  if (!Number.isFinite(Date.parse(lead.createdAt))) throw new Error('Invalid creation time.');
  try {
    const pageUrl = new URL(lead.pageUrl);
    if (!['http:', 'https:'].includes(pageUrl.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid page URL.');
  }

  for (const [field, allowedValues] of Object.entries(ALLOWED_LEAD_VALUES)) {
    if (!allowedValues.includes(lead[field])) throw new Error('Invalid lead field: ' + field);
  }
  if (lead.consent !== true) throw new Error('Contact consent is required.');
  if (lead.leadStatus !== 'new') throw new Error('Invalid lead status.');
  if (lead.phoneVerified !== false) throw new Error('Invalid phone verification state.');

  if (!isPlainObject(lead.source) || !hasExactFields(lead.source, SOURCE_FIELDS)) throw new Error('Invalid source data.');
  for (const field of SOURCE_FIELDS) {
    if (
      typeof lead.source[field] !== 'string'
      || lead.source[field].length > SOURCE_MAX_LENGTHS[field]
      || hasUnsafeControlCharacters(lead.source[field])
    ) {
      throw new Error('Invalid source field: ' + field);
    }
  }

  if (lead.campaignVariant === 'organic') {
    if (lead.county !== '') throw new Error('Organic inquiries must not declare a paid campaign county.');
  } else if (lead.campaignVariant === 'california_homeowners') {
    if (!PAID_COUNTIES.includes(lead.county)) throw new Error('Invalid paid campaign county.');
    if (!['Single-family home', 'Multifamily property'].includes(lead.propertyType)) throw new Error('Invalid paid campaign property type.');
    if (lead.ownership !== 'I own the property') throw new Error('Invalid paid campaign property relationship.');
  } else {
    throw new Error('Invalid campaign variant.');
  }

  return lead;
}

function leadWebhookConfiguration(env) {
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

async function forwardLeadNotification(lead, config, fetchImpl) {
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
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('Lead notification service is unavailable.');
  }
  if (!response.ok) throw new Error('Lead notification service rejected the request.');

  const responseText = (await response.text()).trim();
  if (!responseText) throw new Error('Lead notification service returned an invalid response.');
  let upstreamResult;
  try {
    upstreamResult = JSON.parse(responseText);
  } catch {
    throw new Error('Lead notification service returned an invalid response.');
  }
  if (!isPlainObject(upstreamResult) || upstreamResult.ok !== true) {
    throw new Error('Lead notification service returned an unsuccessful response.');
  }
}
async function deliverLeadNotification(lead, config, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < LEAD_NOTIFICATION_ATTEMPTS; attempt += 1) {
    try {
      await forwardLeadNotification(lead, config, fetchImpl);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < LEAD_NOTIFICATION_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, LEAD_NOTIFICATION_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function centroidForZip(zip, fetchImpl) {
  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/84/query?where=GEOID%3D%27${encodeURIComponent(zip)}%27&outFields=GEOID%2CINTPTLAT%2CINTPTLON&returnGeometry=false&f=json`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('location');
  const body = await response.json();
  const attributes = body?.features?.[0]?.attributes;
  if (!attributes) throw new Error('location');
  return { lat: Number(attributes.INTPTLAT), lon: Number(attributes.INTPTLON) };
}
async function pvgisFor(input, coords, fetchImpl) {
  const orientation = orientationConfig(input.orientation);
  const query = new URLSearchParams({ lat: String(coords.lat), lon: String(coords.lon), peakpower: '1', loss: '14', angle: '20', aspect: String(orientation.aspect), raddatabase: 'PVGIS-NSRDB', outputformat: 'json' });
  const response = await fetchImpl(`${PVGIS_ENDPOINT}?${query}`, { signal: AbortSignal.timeout(12000) });
  if (response.status === 429) throw new Error('rate');
  if (!response.ok) throw new Error('upstream');
  const body = await response.json();
  const annual = Number(body?.outputs?.totals?.fixed?.E_y);
  if (!Number.isFinite(annual) || annual <= 0) throw new Error('upstream');
  return annual;
}

export function createApp({ fetchImpl = fetch, env = process.env } = {}) {
  const app = express();
  const cache = new Map();
  const requests = new Map();
  const notificationRequests = new Map();
  app.set('trust proxy', 1);
  app.use((req, res, next) => req.hostname === 'nexoraglobal.agency' ? res.redirect(308, 'https://www.nexoraglobal.agency' + req.originalUrl) : next());
  app.use(express.json({ limit: '16kb' }));
  app.post('/api/solar-estimate', createRateLimit(requests), async (req, res) => {
    let input;
    try { input = normalizeEstimateInput(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const coords = await centroidForZip(input.zip, fetchImpl);
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) throw new Error('location');
      const modelKey = `${coords.lat.toFixed(3)}:${coords.lon.toFixed(3)}:${input.orientation}`;
      let annual = cache.get(modelKey);
      if (!annual || Date.now() - annual.createdAt > 3600000) {
        annual = { value: await pvgisFor(input, coords, fetchImpl), createdAt: Date.now() };
        cache.set(modelKey, annual);
      }
      return res.json({ estimate: calculateEstimate(input, annual.value), model: { source: 'European Commission JRC PVGIS 5.2 using PVGIS-NSRDB', locationPrecision: 'ZIP-code tabulation area centroid', defaultLossPercent: 14 } });
    } catch (error) {
      const status = error.message === 'location' ? 400 : error.message === 'rate' ? 503 : 502;
      const message = error.message === 'location' ? 'We could not model that ZIP code. Check the ZIP and try again.' : error.message === 'rate' ? 'The solar model is busy. Please try again shortly.' : 'The solar model is temporarily unavailable. Please try again later.';
      return res.status(status).json({ error: message });
    }
  });
  app.get('/api/lead-notification/status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ configured: Boolean(leadWebhookConfiguration(env)) });
  });
  app.post(
    '/api/lead-notification',
    createRateLimit(notificationRequests, LEAD_NOTIFICATION_LIMIT, 'Please wait before sending another notification.'),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const config = leadWebhookConfiguration(env);
      if (!config) return res.status(503).json({ error: 'Lead notifications are not configured.' });
      let lead;
      try {
        lead = validateLeadNotificationPayload(req.body);
      } catch {
        return res.status(400).json({ error: 'Invalid lead notification payload.' });
      }
      try {
        await deliverLeadNotification(lead, config, fetchImpl);
        return res.json({ ok: true });
      } catch {
        return res.status(502).json({ error: 'Lead notification could not be delivered.' });
      }
    },
  );
  app.get('/privacy', (req, res) => res.redirect(308, '/privacy-policy'));
  for (const route of PUBLIC_ROUTES.filter((route) => route !== '/')) {
    app.get(route, (req, res) => res.sendFile(path.join(dist, route, 'index.html')));
  }
  app.use(express.static(dist, { extensions: ['html'] }));
  app.get('/{*splat}', (req, res) => res.status(404).sendFile(path.join(dist, '404', 'index.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error?.type === 'entity.too.large' ? 413 : 400;
    return res.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'Invalid request body.' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, '0.0.0.0', () => console.log(`Nexora server listening on ${port}`));
}
