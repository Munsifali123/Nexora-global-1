import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calculateEstimate, normalizeEstimateInput, orientationConfig, PVGIS_ENDPOINT } from './src/estimator-core.mjs';
import { PUBLIC_ROUTES } from './src/seo.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 20;

function clientIp(req) { return req.ip || req.socket.remoteAddress || 'unknown'; }
function createRateLimit(requests) {
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = clientIp(req);
    const recent = (requests.get(ip) || []).filter((value) => now - value < WINDOW_MS);
    if (recent.length >= LIMIT) return res.status(429).json({ error: 'Please wait before trying another estimate.' });
    recent.push(now);
    requests.set(ip, recent);
    return next();
  };
}
async function centroidForZip(zip, fetchImpl) {
  const url = `https://api.census.gov/data/2020/dec/pl?get=NAME,INTPTLAT,INTPTLON&for=zip%20code%20tabulation%20area:${encodeURIComponent(zip)}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('location');
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('location');
  return { lat: Number(rows[1][1]), lon: Number(rows[1][2]) };
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

export function createApp({ fetchImpl = fetch } = {}) {
  const app = express();
  const cache = new Map();
  const requests = new Map();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8kb' }));
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
  for (const route of PUBLIC_ROUTES.filter((route) => route !== '/')) {
    app.get(route, (req, res) => res.sendFile(path.join(dist, route, 'index.html')));
  }
  app.use(express.static(dist, { extensions: ['html'] }));
  app.get('/{*splat}', (req, res) => res.status(404).sendFile(path.join(dist, '404', 'index.html')));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, '0.0.0.0', () => console.log(`Nexora server listening on ${port}`));
}
