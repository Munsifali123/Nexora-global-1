import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEstimate, normalizeEstimateInput } from '../src/estimator-core.mjs';
import { createApp } from '../server.mjs';

const valid = { zip: '77002', monthlyKwh: 1000, offset: 100, panelWattage: 400, orientation: 'south', shading: 'some', futureUsageAdjustment: 0 };

async function withServer(fetchImpl, run) {
  const server = createApp({ fetchImpl }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
function validModelFetch(url) {
  if (url.startsWith('https://api.census.gov/')) return Response.json([['NAME', 'INTPTLAT', 'INTPTLON', 'zip code tabulation area'], ['ZCTA5 77002', '29.7604', '-95.3698', '77002']]);
  if (url.startsWith('https://re.jrc.ec.europa.eu/')) return Response.json({ outputs: { totals: { fixed: { E_y: 1450 } } } });
  throw new Error(`Unexpected URL: ${url}`);
}

test('calculates a bounded transparent range', () => {
  const result = calculateEstimate(valid, 1450);
  assert.equal(result.systemKw.low, 8.3);
  assert.equal(result.systemKw.high, 9.7);
  assert.deepEqual(result.panels, { low: 21, high: 25 });
  assert.ok(result.production.high > result.production.low);
});
test('rejects invalid estimator inputs', () => {
  for (const field of [{ ...valid, zip: 'abc' }, { ...valid, monthlyKwh: 0 }, { ...valid, offset: 120 }, { ...valid, panelWattage: 0 }]) assert.throws(() => normalizeEstimateInput(field));
});
test('serves a validated PVGIS-backed estimate without exposing inputs to analytics', async () => {
  await withServer(validModelFetch, async (origin) => {
    const response = await fetch(`${origin}/api/solar-estimate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.model.locationPrecision, 'ZIP-code tabulation area centroid');
    assert.equal(body.estimate.systemKw.low, 8.3);
  });
});
test('returns safe validation and upstream failure responses', async () => {
  await withServer(async (url) => url.startsWith('https://api.census.gov/') ? Response.json([['NAME', 'INTPTLAT', 'INTPTLON'], ['ZCTA5 77002', '29.7604', '-95.3698']]) : Response.json({}, { status: 503 }), async (origin) => {
    const invalid = await fetch(`${origin}/api/solar-estimate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, zip: 'bad' }) });
    assert.equal(invalid.status, 400);
    const unavailable = await fetch(`${origin}/api/solar-estimate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) });
    assert.equal(unavailable.status, 502);
  });
});
