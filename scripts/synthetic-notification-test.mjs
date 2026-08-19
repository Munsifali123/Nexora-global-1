import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createAppsScriptDelivery, DeliveryError, leadWebhookConfiguration } from '../server/appsScriptDelivery.mjs';
import { createFirebaseNotificationStore } from '../server/firebaseNotificationStore.mjs';
import { validateCanonicalLead } from '../server/leadNotificationSchema.mjs';
import { createNotificationQueue } from '../server/notificationQueue.mjs';
import { firebaseAdminConfiguration } from '../server/notificationRuntime.mjs';

const REQUIRED_TEST_FLAG = 'true';
const silentLogger = { warn() {} };

function httpsOrigin(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('Synthetic notification test origin is invalid.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Synthetic notification test origin is invalid.');
  }
  return parsed.origin;
}

function requireSafeConfiguration(env) {
  if (String(env.ALLOW_SYNTHETIC_NOTIFICATION_TEST || '').trim() !== REQUIRED_TEST_FLAG) {
    throw new Error('Synthetic notification testing is not explicitly enabled.');
  }
  const admin = firebaseAdminConfiguration(env);
  const webhook = leadWebhookConfiguration(env);
  const testOrigin = httpsOrigin(env.LEAD_NOTIFICATION_TEST_ORIGIN);
  if (!admin || !webhook) throw new Error('Synthetic notification test configuration is incomplete.');
  return { admin, webhook, testOrigin };
}

async function jsonBody(response) {
  try {
    const text = (await response.text()).trim();
    if (!text) throw new Error();
    const body = JSON.parse(text);
    if (!body || Object.prototype.toString.call(body) !== '[object Object]') throw new Error();
    return body;
  } catch {
    throw new Error('Synthetic notification endpoint returned invalid JSON.');
  }
}

function syntheticLead(createdAt) {
  return {
    name: 'SYNTHETIC TEST',
    number: '+1 000 000 0000',
    email: 'notification-test@example.invalid',
    address: 'SYNTHETIC TEST - NO REAL PROPERTY',
    zipCode: '00000',
    propertyType: 'Single-family home',
    ownership: 'I own the property',
    electricBill: 'Under $100',
    sunlightExposure: 'Unsure',
    timeline: 'Just researching',
    financingInterest: 'Not sure yet',
    description: 'SYNTHETIC TEST ONLY - NO REAL HOMEOWNER',
    consent: true,
    consentText: 'Synthetic pipeline verification only; no real person submitted this inquiry.',
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
    createdAt,
    county: '',
    campaignVariant: 'organic',
  };
}

async function run() {
  const { admin, webhook, testOrigin } = requireSafeConfiguration(process.env);
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: admin.projectId,
  }, `nexora-synthetic-notification-${process.pid}`);
  const db = getFirestore(app);
  const inquiryRef = db.collection('inquiries').doc();
  const jobRef = db.collection('leadNotificationJobs').doc(inquiryRef.id);
  const realCreatedAt = Timestamp.now();
  // Keep this job outside the production worker's real-time due window. Only
  // the ID-scoped test store below observes the virtual clock one hour ahead.
  let virtualNowMs = Date.now() + (60 * 60 * 1000);
  const testDueAt = Timestamp.fromMillis(virtualNowMs);

  try {
    const batch = db.batch();
    batch.create(inquiryRef, syntheticLead(realCreatedAt));
    batch.create(jobRef, {
      leadId: inquiryRef.id,
      state: 'pending',
      attempts: 0,
      dueAt: testDueAt,
      createdAt: realCreatedAt,
    });
    await batch.commit();

    const spoofedResponse = await fetch(testOrigin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: inquiryRef.id, spoofed: true }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const spoofedResult = await jsonBody(spoofedResponse);
    if (spoofedResponse.status !== 400 || typeof spoofedResult.error !== 'string') {
      throw new Error('Spoofed-field rejection verification failed.');
    }

    const acceleratorResponse = await fetch(testOrigin + '/api/lead-notification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId: inquiryRef.id }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const acceleratorResult = await jsonBody(acceleratorResponse);
    if (
      acceleratorResponse.status !== 202
      || acceleratorResult.ok !== true
      || acceleratorResult.queued !== true
      || Object.keys(acceleratorResult).length !== 2
    ) {
      throw new Error('Live authenticity endpoint verification failed.');
    }

    const deliberatelyWrongToken = webhook.webhookToken === 'synthetic-deliberately-wrong-token'
      ? 'synthetic-deliberately-wrong-token-2'
      : 'synthetic-deliberately-wrong-token';
    const wrongTokenResponse = await fetch(webhook.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        token: deliberatelyWrongToken,
        payload: '{}',
      }).toString(),
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    const wrongTokenResult = await jsonBody(wrongTokenResponse);
    if (wrongTokenResult.ok !== false) {
      throw new Error('Wrong-token rejection verification failed.');
    }

    const store = createFirebaseNotificationStore({
      db,
      Timestamp,
      onlyLeadId: inquiryRef.id,
    });
    const now = () => new Date(virtualNowMs);
    const simulatedFailure = createNotificationQueue({
      store,
      deliver: async () => { throw new DeliveryError('network_error'); },
      now,
      leaseMs: 500,
      baseRetryMs: 1000,
      maxRetryMs: 1000,
      logger: silentLogger,
    });
    await simulatedFailure.drain();

    const retrySnapshot = await jobRef.get();
    const retryJob = retrySnapshot.data();
    if (
      retryJob?.state !== 'pending'
      || retryJob?.attempts !== 1
      || retryJob?.lastErrorCode !== 'network_error'
    ) {
      throw new Error('Durable retry verification failed.');
    }

    virtualNowMs += 1000;
    const appsScriptDelivery = createAppsScriptDelivery({ config: webhook });
    let firstAcknowledgement;
    const recoveryWorker = createNotificationQueue({
      store,
      deliver: async (lead) => {
        firstAcknowledgement = await appsScriptDelivery(lead);
      },
      now,
      leaseMs: 60_000,
      logger: silentLogger,
    });
    await recoveryWorker.drain();

    const deliveredSnapshot = await jobRef.get();
    const deliveredJob = deliveredSnapshot.data();
    if (
      deliveredJob?.state !== 'delivered'
      || deliveredJob?.attempts !== 2
      || !firstAcknowledgement
      || firstAcknowledgement.duplicate !== false
    ) {
      throw new Error('Recovered delivery verification failed.');
    }

    const canonical = validateCanonicalLead(inquiryRef.id, (await inquiryRef.get()).data());
    const replayAcknowledgement = await appsScriptDelivery(canonical);
    if (
      replayAcknowledgement.duplicate !== true
      || replayAcknowledgement.referenceNumber !== firstAcknowledgement.referenceNumber
    ) {
      throw new Error('Duplicate protection verification failed.');
    }

    console.log('Synthetic notification: live authenticity endpoint verified.');
    console.log('Synthetic notification: malformed request and wrong token rejected.');
    console.log('Synthetic notification: delivered.');
    console.log('Synthetic notification: retry recovery verified.');
    console.log('Synthetic notification: duplicate protection verified.');
  } finally {
    const cleanup = db.batch();
    cleanup.delete(inquiryRef);
    cleanup.delete(jobRef);
    await cleanup.commit().catch(() => {});
    await deleteApp(app);
  }
}

run().catch(() => {
  console.error('Synthetic notification test failed.');
  process.exitCode = 1;
});
