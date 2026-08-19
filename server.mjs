import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateEstimate, normalizeEstimateInput, orientationConfig, PVGIS_ENDPOINT } from './src/estimator-core.mjs';
import { PUBLIC_ROUTES } from './src/seo.js';
import { validateLeadNotificationPayload, validateNotificationRequest } from './server/leadNotificationSchema.mjs';
import { NotificationQueueError } from './server/notificationQueue.mjs';
import { createDefaultNotificationRuntime } from './server/notificationRuntime.mjs';
export { validateLeadNotificationPayload };

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 20;
const LEAD_NOTIFICATION_LIMIT = 10;

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

export function createApp({
  fetchImpl = fetch,
  env = process.env,
  notificationRuntime,
} = {}) {
  const app = express();
  const cache = new Map();
  const requests = new Map();
  const notificationRequests = new Map();
  let runtime = notificationRuntime;
  if (runtime === undefined) {
    try {
      runtime = createDefaultNotificationRuntime({ env, fetchImpl });
    } catch {
      runtime = null;
      console.warn('Lead notification worker could not be initialized.');
    }
  }

  runtime?.start?.();
  app.locals.stopLeadNotificationQueue = () => runtime?.stop?.();

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
    return res.json({ configured: Boolean(runtime) });
  });
  app.post(
    '/api/lead-notification',
    createRateLimit(notificationRequests, LEAD_NOTIFICATION_LIMIT, 'Please wait before sending another notification.'),
    async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (!runtime) return res.status(503).json({ error: 'Lead notifications are not configured.' });

      let request;
      try {
        request = validateNotificationRequest(req.body);
      } catch {
        return res.status(400).json({ error: 'Invalid lead notification request.' });
      }

      try {
        await runtime.enqueueLead(request.leadId);
        return res.status(202).json({ ok: true, queued: true });
      } catch (error) {
        if (
          error instanceof NotificationQueueError
          && ['lead_not_found', 'lead_invalid'].includes(error.code)
        ) {
          return res.status(400).json({ error: 'Lead notification request was rejected.' });
        }
        return res.status(503).json({ error: 'Lead notification queue is temporarily unavailable.' });
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
  const app = createApp();
  const server = app.listen(port, '0.0.0.0', () => console.log(`Nexora server listening on ${port}`));
  const shutdown = () => {
    app.locals.stopLeadNotificationQueue?.();
    server.close();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
