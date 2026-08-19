import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createApp, validateLeadNotificationPayload } from '../server.mjs';
import { sendLeadNotification } from '../src/leadNotification.js';
import { NotificationQueueError } from '../server/notificationQueue.mjs';

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

test('client posts only the lead ID to the same-origin endpoint without a credential', async () => {
  let captured;
  const result = await sendLeadNotification(validLead.leadId, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return Response.json({ ok: true });
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(captured.url, '/api/lead-notification');
  assert.equal(captured.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(captured.options.body), { leadId: validLead.leadId });
  assert.deepEqual(Object.keys(JSON.parse(captured.options.body)), ['leadId']);
  assert.equal(captured.options.body.includes('WEBHOOK_TOKEN'), false);
  assert.equal(new URLSearchParams(captured.options.body).has('token'), false);
});

test('server accepts only a lead ID and queues canonical lookup through the injected runtime', async () => {
  const queued = [];
  let starts = 0;
  const notificationRuntime = {
    start() { starts += 1; },
    stop() {},
    async enqueueLead(leadId) { queued.push(leadId); },
  };

  await withServer({ notificationRuntime }, async (origin) => {
    const statusResponse = await fetch(origin + '/api/lead-notification/status');
    assert.deepEqual(await statusResponse.json(), { configured: true });

    const response = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: validLead.leadId }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, queued: true });
  });

  assert.equal(starts, 1);
  assert.deepEqual(queued, [validLead.leadId]);
});

test('server rejects browser PII, nonexistent leads, storage failures, and disabled operation safely', async () => {
  let queueCalls = 0;
  const acceptingRuntime = {
    start() {},
    stop() {},
    async enqueueLead() { queueCalls += 1; },
  };
  await withServer({ notificationRuntime: acceptingRuntime }, async (origin) => {
    const invalid = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validLead),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'Invalid lead notification request.' });
    assert.equal(queueCalls, 0);
  });

  const rejectingRuntime = {
    start() {},
    stop() {},
    async enqueueLead() { throw new NotificationQueueError('lead_not_found'); },
  };
  await withServer({ notificationRuntime: rejectingRuntime }, async (origin) => {
    const missing = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: validLead.leadId }),
    });
    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: 'Lead notification request was rejected.' });
  });

  const unavailableRuntime = {
    start() {},
    stop() {},
    async enqueueLead() { throw new NotificationQueueError('storage_unavailable'); },
  };
  await withServer({ notificationRuntime: unavailableRuntime }, async (origin) => {
    const unavailable = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: validLead.leadId }),
    });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      error: 'Lead notification queue is temporarily unavailable.',
    });
  });

  await withServer({ notificationRuntime: null }, async (origin) => {
    const statusResponse = await fetch(origin + '/api/lead-notification/status');
    assert.deepEqual(await statusResponse.json(), { configured: false });

    const response = await fetch(origin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: validLead.leadId }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Lead notifications are not configured.' });
  });
});
