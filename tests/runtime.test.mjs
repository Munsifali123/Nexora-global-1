import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { PUBLIC_ROUTES, SITEMAP_ROUTES } from '../src/seo.js';

async function withServer(run) {
  const server = createApp({ env: {} }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('serves every public route, redirect, 404, and configuration status correctly', async () => {
  await withServer(async (origin) => {
    for (const route of PUBLIC_ROUTES) {
      const response = await fetch(origin + route, { redirect: 'manual' });
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type') || '', /^text\/html/);
    }

    const privacyAlias = await fetch(origin + '/privacy', { redirect: 'manual' });
    assert.equal(privacyAlias.status, 308);
    assert.equal(privacyAlias.headers.get('location'), '/privacy-policy');

    const missing = await fetch(origin + '/definitely-not-a-real-page');
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Page Not Found \| Nexora Global/);

    const status = await fetch(origin + '/api/lead-notification/status');
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { configured: false });
  });
});

test('serves substantive noindex campaign and full privacy HTML', async () => {
  const campaign = await readFile('dist/solar/california/homeowners/index.html', 'utf8');
  assert.match(campaign, /name="robots" content="noindex,follow"/);
  assert.match(campaign, /Orange County/);
  assert.match(campaign, /Nexora Global is not a solar installer/);
  assert.match(campaign, /does not accept renter, commercial, farm, or agricultural inquiries/);

  const privacy = await readFile('dist/privacy-policy/index.html', 'utf8');
  assert.match(privacy, /Independent solar providers/);
  assert.match(privacy, /Global Privacy Control/);
  assert.match(privacy, /Advanced Matching and Conversions API are not enabled/);
  assert.match(privacy, /Retention and security/);
});

test('keeps the campaign out of the sitemap and credentials out of browser assets', async () => {
  const sitemap = await readFile('public/sitemap.xml', 'utf8');
  const campaignRoute = '/solar/california/homeowners';
  assert.equal(SITEMAP_ROUTES.includes(campaignRoute), false);
  assert.doesNotMatch(sitemap, /solar\/california\/homeowners/);

  const assetDirectory = path.resolve('dist/assets');
  const scripts = (await readdir(assetDirectory)).filter((name) => name.endsWith('.js'));
  const browserCode = (await Promise.all(scripts.map((name) => readFile(path.join(assetDirectory, name), 'utf8')))).join('\n');
  assert.doesNotMatch(browserCode, /LEAD_WEBHOOK_TOKEN|VITE_LEAD_WEBHOOK|script\.google\.com\/macros/);
  assert.doesNotMatch(browserCode, /123456789012345|VITE_META_PIXEL_ID/);
});
