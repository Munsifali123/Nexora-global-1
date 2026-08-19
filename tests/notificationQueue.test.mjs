import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptDelivery, DeliveryError } from '../server/appsScriptDelivery.mjs';
import {
  createNotificationQueue,
  NotificationQueueError,
} from '../server/notificationQueue.mjs';
import {
  validateCanonicalLead,
  validateNotificationRequest,
} from '../server/leadNotificationSchema.mjs';
import { createApp } from '../server.mjs';
import { firebaseAdminConfiguration } from '../server/notificationRuntime.mjs';
import { validateStoredNotificationJob } from '../server/firebaseNotificationStore.mjs';

const LEAD_ID = 'synthetic_test_lead_001';

function canonicalLead(overrides = {}) {
  return {
    name: 'SYNTHETIC TEST',
    number: '+1 000 000 0000',
    email: 'notification-test@example.invalid',
    address: 'SYNTHETIC TEST - NO REAL PROPERTY',
    zipCode: '00000',
    propertyType: 'Single-family home',
    ownership: 'I own the property',
    electricBill: '$100–$200',
    sunlightExposure: 'Mostly full sun',
    timeline: 'Just researching',
    financingInterest: 'Not sure yet',
    description: 'SYNTHETIC TEST ONLY - NO REAL HOMEOWNER',
    consent: true,
    consentText: 'Synthetic notification pipeline validation only; no real person submitted this inquiry.',
    consentVersion: '2026-08-19-test',
    leadStatus: 'new',
    phoneVerified: false,
    pageUrl: 'https://example.invalid/synthetic-notification-test',
    source: {
      internalSource: 'synthetic_notification_test',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      gclid: '',
    },
    createdAt: { toDate: () => new Date('2026-08-19T00:00:00.000Z') },
    county: '',
    campaignVariant: 'organic',
    ...overrides,
  };
}

class MemoryStore {
  constructor() {
    this.leads = new Map();
    this.jobs = new Map();
    this.failMarkDelivered = false;
  }

  async getCanonicalLead(leadId) {
    return this.leads.get(leadId) || null;
  }

  async enqueue(leadId, now) {
    if (!this.jobs.has(leadId)) {
      this.jobs.set(leadId, {
        leadId,
        state: 'pending',
        attempts: 0,
        dueAt: now,
        createdAt: now,
      });
    }
    return this.jobs.get(leadId).state;
  }

  async claimDue({ now, leaseMs, limit, leaseIdFactory }) {
    const claims = [];
    for (const job of this.jobs.values()) {
      if (claims.length >= limit) break;
      if (job.state !== 'pending' || job.dueAt.getTime() > now.getTime()) continue;
      if (job.leaseUntil && job.leaseUntil.getTime() > now.getTime()) continue;
      job.attempts += 1;
      job.leaseId = leaseIdFactory();
      job.leaseUntil = new Date(now.getTime() + leaseMs);
      job.dueAt = job.leaseUntil;
      claims.push({ leadId: job.leadId, leaseId: job.leaseId, attemptCount: job.attempts });
    }
    return claims;
  }

  async markDelivered(claim, now) {
    if (this.failMarkDelivered) throw new Error('synthetic persistence failure');
    const job = this.jobs.get(claim.leadId);
    if (!job || job.state !== 'pending' || job.leaseId !== claim.leaseId) return false;
    Object.assign(job, {
      state: 'delivered',
      dueAt: null,
      leaseId: null,
      leaseUntil: null,
      lastErrorCode: null,
      deliveredAt: now,
    });
    return true;
  }

  async scheduleRetry(claim, { dueAt, errorCode }) {
    const job = this.jobs.get(claim.leadId);
    if (!job || job.state !== 'pending' || job.leaseId !== claim.leaseId) return false;
    Object.assign(job, {
      dueAt,
      leaseId: null,
      leaseUntil: null,
      lastErrorCode: errorCode,
    });
    return true;
  }
}

function queueOptions(store, deliver, clock) {
  let lease = 0;
  return {
    store,
    deliver,
    now: () => new Date(clock.value),
    leaseIdFactory: () => `lease-${++lease}`,
    leaseMs: 500,
    baseRetryMs: 1000,
    maxRetryMs: 8000,
    logger: { warn() {} },
  };
}

async function withServer(notificationRuntime, run) {
  const app = createApp({ notificationRuntime });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    app.locals.stopLeadNotificationQueue?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('requires an explicit true feature flag and both Firebase Admin environment names', () => {
  const complete = {
    LEAD_NOTIFICATION_ENABLED: 'true',
    FIREBASE_PROJECT_ID: 'synthetic-project',
    GOOGLE_APPLICATION_CREDENTIALS: 'synthetic-credentials-path',
  };
  assert.deepEqual(firebaseAdminConfiguration(complete), { projectId: 'synthetic-project' });
  assert.equal(firebaseAdminConfiguration({ ...complete, LEAD_NOTIFICATION_ENABLED: 'TRUE' }), null);
  assert.equal(firebaseAdminConfiguration({ ...complete, FIREBASE_PROJECT_ID: '' }), null);
  assert.equal(firebaseAdminConfiguration({ ...complete, GOOGLE_APPLICATION_CREDENTIALS: '' }), null);
});

test('fails closed for mismatched, malformed, or PII-bearing outbox documents', () => {
  const initialJob = {
    leadId: LEAD_ID,
    state: 'pending',
    attempts: 0,
    dueAt: new Date('2026-08-19T00:00:00.000Z'),
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
  };
  assert.equal(validateStoredNotificationJob(initialJob, LEAD_ID), initialJob);
  assert.throws(
    () => validateStoredNotificationJob(initialJob, 'different_document_id'),
    /Invalid notification job/,
  );
  assert.throws(
    () => validateStoredNotificationJob({ ...initialJob, address: 'must not be queued' }, LEAD_ID),
    /Invalid notification job/,
  );
  assert.throws(
    () => validateStoredNotificationJob({ ...initialJob, attempts: -1 }, LEAD_ID),
    /Invalid notification job/,
  );
  assert.throws(
    () => validateStoredNotificationJob({ ...initialJob, state: 'processing' }, LEAD_ID),
    /Invalid notification job/,
  );
});

test('accepts only an exact lead-ID request and validates canonical Firestore data', () => {
  assert.deepEqual(validateNotificationRequest({ leadId: LEAD_ID }), { leadId: LEAD_ID });
  assert.throws(() => validateNotificationRequest({ leadId: LEAD_ID, name: 'browser value' }));
  assert.throws(() => validateNotificationRequest({ leadId: '../invalid' }));

  const validated = validateCanonicalLead(LEAD_ID, canonicalLead());
  assert.equal(validated.leadId, LEAD_ID);
  assert.equal(validated.createdAt, '2026-08-19T00:00:00.000Z');
  assert.throws(() => validateCanonicalLead(LEAD_ID, canonicalLead({ unexpected: true })));
  assert.throws(() => validateCanonicalLead(LEAD_ID, canonicalLead({ leadStatus: 'contacted' })));
});

test('authenticates against Firestore before enqueueing and delivers canonical data only once', async () => {
  const store = new MemoryStore();
  const clock = { value: Date.parse('2026-08-19T00:00:00.000Z') };
  const delivered = [];
  const queue = createNotificationQueue(queueOptions(store, async (lead) => delivered.push(lead), clock));

  await assert.rejects(() => queue.enqueue(LEAD_ID), (error) => (
    error instanceof NotificationQueueError && error.code === 'lead_not_found'
  ));
  assert.equal(store.jobs.size, 0);

  store.leads.set(LEAD_ID, canonicalLead());
  await queue.enqueue(LEAD_ID);
  await queue.drain();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].address, 'SYNTHETIC TEST - NO REAL PROPERTY');
  assert.equal(store.jobs.get(LEAD_ID).state, 'delivered');

  await queue.enqueue(LEAD_ID);
  await queue.drain();
  assert.equal(delivered.length, 1, 'a delivered job is not delivered again by browser replay');
});

test('persists a due retry and a new worker drains it after restart', async () => {
  const store = new MemoryStore();
  const clock = { value: Date.parse('2026-08-19T00:00:00.000Z') };
  store.leads.set(LEAD_ID, canonicalLead());
  await store.enqueue(LEAD_ID, new Date(clock.value));

  const firstWorker = createNotificationQueue(queueOptions(store, async () => {
    throw new DeliveryError('network_error');
  }, clock));
  await firstWorker.drain();

  const pending = store.jobs.get(LEAD_ID);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.attempts, 1);
  assert.equal(pending.lastErrorCode, 'network_error');
  assert.equal(pending.dueAt.getTime(), clock.value + 1000);

  clock.value += 1000;
  let delivered = 0;
  const restartedWorker = createNotificationQueue(queueOptions(store, async () => { delivered += 1; }, clock));
  await restartedWorker.drain();
  assert.equal(delivered, 1);
  assert.equal(store.jobs.get(LEAD_ID).state, 'delivered');
  assert.equal(store.jobs.get(LEAD_ID).attempts, 2);
});

test('an expired transactional lease is recoverable for at-least-once delivery', async () => {
  const store = new MemoryStore();
  const clock = { value: Date.parse('2026-08-19T00:00:00.000Z') };
  store.leads.set(LEAD_ID, canonicalLead());
  await store.enqueue(LEAD_ID, new Date(clock.value));

  const abandoned = await store.claimDue({
    now: new Date(clock.value),
    leaseMs: 500,
    limit: 1,
    leaseIdFactory: () => 'abandoned-lease',
  });
  assert.equal(abandoned.length, 1);

  clock.value += 500;
  let delivered = 0;
  const restartedWorker = createNotificationQueue(queueOptions(store, async () => { delivered += 1; }, clock));
  await restartedWorker.drain();
  assert.equal(delivered, 1);
  assert.equal(store.jobs.get(LEAD_ID).state, 'delivered');
  assert.equal(store.jobs.get(LEAD_ID).attempts, 2);
});

test('replays after upstream success when the delivered marker was not persisted', async () => {
  const store = new MemoryStore();
  const clock = { value: Date.parse('2026-08-19T00:00:00.000Z') };
  store.leads.set(LEAD_ID, canonicalLead());
  await store.enqueue(LEAD_ID, new Date(clock.value));
  store.failMarkDelivered = true;
  let deliveries = 0;
  const queue = createNotificationQueue(queueOptions(store, async () => { deliveries += 1; }, clock));

  await queue.drain();
  assert.equal(deliveries, 1);
  assert.equal(store.jobs.get(LEAD_ID).state, 'pending');
  assert.equal(store.jobs.get(LEAD_ID).lastErrorCode, 'delivery_failed');

  store.failMarkDelivered = false;
  clock.value += 1000;
  await queue.drain();
  assert.equal(deliveries, 2, 'at-least-once recovery intentionally replays the same lead');
  assert.equal(store.jobs.get(LEAD_ID).state, 'delivered');
});

test('Apps Script delivery requires an acknowledgement for the same lead and stable reference', async () => {
  const config = { webhookUrl: 'https://script.example.invalid/lead', webhookToken: 'server-only-test-token' };
  const payload = validateCanonicalLead(LEAD_ID, canonicalLead());
  let forwarded;
  const deliver = createAppsScriptDelivery({
    config,
    fetchImpl: async (url, options) => {
      forwarded = { url, options };
      return Response.json({ ok: true, leadId: LEAD_ID, referenceNumber: 'S-1001', duplicate: false });
    },
  });
  assert.deepEqual(await deliver(payload), { referenceNumber: 'S-1001', duplicate: false });
  assert.equal(forwarded.url, config.webhookUrl);
  const body = new URLSearchParams(forwarded.options.body);
  assert.equal(body.get('token'), config.webhookToken);
  assert.deepEqual(JSON.parse(body.get('payload')), payload);

  const mismatch = createAppsScriptDelivery({
    config,
    fetchImpl: async () => Response.json({
      ok: true,
      leadId: 'different_lead_001',
      referenceNumber: 'S-1001',
      duplicate: false,
    }),
  });
  await assert.rejects(() => mismatch(payload), (error) => (
    error instanceof DeliveryError && error.code === 'invalid_acknowledgement'
  ));
});

test('same-origin endpoint accepts only {leadId} and exposes no PII forwarding path', async () => {
  const accepted = [];
  const runtime = {
    start() {},
    stop() {},
    async enqueueLead(leadId) { accepted.push(leadId); },
  };
  await withServer(runtime, async (origin) => {
    const acceptedResponse = await fetch(`${origin}/api/lead-notification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: LEAD_ID }),
    });
    assert.equal(acceptedResponse.status, 202);
    assert.deepEqual(await acceptedResponse.json(), { ok: true, queued: true });

    const rejectedResponse = await fetch(`${origin}/api/lead-notification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: LEAD_ID, address: 'browser-supplied' }),
    });
    assert.equal(rejectedResponse.status, 400);
    assert.deepEqual(await rejectedResponse.json(), { error: 'Invalid lead notification request.' });
  });
  assert.deepEqual(accepted, [LEAD_ID]);
});
