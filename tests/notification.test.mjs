import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp, validateLeadNotificationPayload } from '../server.mjs';
import { sendLeadNotification } from '../src/leadNotification.js';

const validLead = {
  leadId: 'unit-test-lead-001',
  name: 'Automation Fixture',
  number: '+1 000 000 0000',
  email: 'fixture@example.invalid',
  address: 'Unit test property',
  zipCode: '00000',
  propertyType: 'Single-family home',
  ownership: 'I own the property',
  electricBill: '$100\u2013$200',
  sunlightExposure: 'Mostly full sun',
  timeline: 'Within 1\u20133 months',
  financingInterest: 'Not sure yet',
  description: '',
  consent: true,
  consentText: 'Synthetic test consent text used only for local validation.',
  consentVersion: '2026-08-19-test',
  leadStatus: 'new',
  phoneVerified: false,
  pageUrl: 'https://example.invalid/test-inquiry',
  source: {
    internalSource: '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    gclid: '',
  },
  createdAt: '2026-08-19T00:00:00.000Z',
  county: '',
  campaignVariant: 'organic',
};

async function withServer(options, run) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await run('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('validates an exact organic or paid campaign lead schema', () => {
  assert.deepEqual(validateLeadNotificationPayload(structuredClone(validLead)), validLead);

  const paidLead = {
    ...validLead,
    county: 'Orange County',
    campaignVariant: 'california_homeowners',
    propertyType: 'Multifamily property',
  };
  assert.doesNotThrow(() => validateLeadNotificationPayload(paidLead));
  assert.doesNotThrow(() => validateLeadNotificationPayload({
    ...validLead,
    source: { ...validLead.source, gclid: 'x'.repeat(512) },
  }));
  assert.throws(
    () => validateLeadNotificationPayload({
      ...validLead,
      source: { ...validLead.source, gclid: 'x'.repeat(513) },
    }),
    /Invalid source field: gclid/,
  );
  assert.throws(() => validateLeadNotificationPayload({ ...validLead, unexpected: true }), /Invalid lead payload/);
  assert.throws(
    () => validateLeadNotificationPayload({ ...paidLead, ownership: 'I rent or lease the property' }),
    /Invalid paid campaign property relationship/,
  );
  assert.throws(
    () => validateLeadNotificationPayload({ ...validLead, county: 'Orange County' }),
    /Organic inquiries/,
  );
});

test('Apps Script applies the same closed campaign schema before storing or emailing', () => {
  const appsScript = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
  const validate = (lead) => vm.runInNewContext(
    appsScript + '\nvalidateLead_(leadFixture);',
    { leadFixture: structuredClone(lead), console: { error() {} } },
  );

  assert.doesNotThrow(() => validate(validLead));
  assert.throws(
    () => validate({ ...validLead, campaignVariant: 'california_homeowners', county: 'Orange County', ownership: 'I rent or lease the property' }),
    /Invalid paid campaign relationship/,
  );
});

test('client posts the lead only to the same-origin endpoint without a credential', async () => {
  let captured;
  const result = await sendLeadNotification(validLead, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return Response.json({ ok: true });
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured.url, '/api/lead-notification');
  assert.equal(captured.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(captured.options.body), validLead);
  assert.equal(captured.options.body.includes('WEBHOOK_TOKEN'), false);
  assert.equal(new URLSearchParams(captured.options.body).has('token'), false);
});

test('server forwards a validated lead as an encoded payload and verifies success', async () => {
  let upstream;
  const fetchImpl = async (url, options) => {
    upstream = { url, options };
    return Response.json({ ok: true, referenceNumber: 'S-TEST' });
  };

  await withServer({
    fetchImpl,
    env: {
      LEAD_WEBHOOK_URL: 'https://script.example.invalid/lead',
      LEAD_WEBHOOK_TOKEN: 'local-unit-test-token',
    },
  }, async (origin) => {
    const statusResponse = await fetch(origin + '/api/lead-notification/status');
    assert.deepEqual(await statusResponse.json(), { configured: true });

    const response = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validLead),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  assert.equal(upstream.url, 'https://script.example.invalid/lead');
  const forwarded = new URLSearchParams(upstream.options.body);
  assert.equal(forwarded.get('token'), 'local-unit-test-token');
  assert.deepEqual(JSON.parse(forwarded.get('payload')), validLead);
  assert.equal(upstream.options.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
});

test('server rejects invalid, unconfigured, and unsuccessful notification requests safely', async () => {
  let upstreamCalls = 0;
  await withServer({
    fetchImpl: async () => {
      upstreamCalls += 1;
      return Response.json({ ok: false, error: 'synthetic failure' });
    },
    env: {
      LEAD_WEBHOOK_URL: 'https://script.example.invalid/lead',
      LEAD_WEBHOOK_TOKEN: 'local-unit-test-token',
    },
  }, async (origin) => {
    const invalid = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validLead, extra: 'rejected' }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Invalid lead notification payload.' });
    assert.equal(upstreamCalls, 0);

    const rejected = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validLead),
    });
    assert.equal(rejected.status, 502);
    assert.deepEqual(await rejected.json(), { error: 'Lead notification could not be delivered.' });
    assert.equal(upstreamCalls, 3, 'delivery failures receive three bounded attempts');
  });

  let invalidResponseCalls = 0;
  await withServer({
    fetchImpl: async () => {
      invalidResponseCalls += 1;
      return new Response('<html>not a webhook result</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    },
    env: {
      LEAD_WEBHOOK_URL: 'https://script.example.invalid/lead',
      LEAD_WEBHOOK_TOKEN: 'local-unit-test-token',
    },
  }, async (origin) => {
    const response = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validLead),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Lead notification could not be delivered.' });
  });
  assert.equal(invalidResponseCalls, 3);

  await withServer({ fetchImpl: async () => assert.fail('Unconfigured server must not call upstream.'), env: {} }, async (origin) => {
    const statusResponse = await fetch(origin + '/api/lead-notification/status');
    assert.deepEqual(await statusResponse.json(), { configured: false });

    const response = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validLead),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Lead notifications are not configured.' });
  });
});
