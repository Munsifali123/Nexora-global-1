import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createAppsScriptDelivery, leadWebhookConfiguration } from './appsScriptDelivery.mjs';
import { createFirebaseNotificationStore } from './firebaseNotificationStore.mjs';
import { createNotificationQueue } from './notificationQueue.mjs';

const ADMIN_APP_NAME = 'nexora-lead-notifications';

export function firebaseAdminConfiguration(env) {
  if (String(env.LEAD_NOTIFICATION_ENABLED || '').trim() !== 'true') return null;
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  const credentialsPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (!projectId || !credentialsPath) return null;
  return { projectId };
}

export function createDefaultNotificationRuntime({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  const webhookConfig = leadWebhookConfiguration(env);
  const adminConfig = firebaseAdminConfiguration(env);
  if (!webhookConfig || !adminConfig) return null;

  const existingApp = getApps().find((app) => app.name === ADMIN_APP_NAME);
  const adminApp = existingApp || initializeApp({
    credential: applicationDefault(),
    projectId: adminConfig.projectId,
  }, ADMIN_APP_NAME);
  const db = getFirestore(adminApp);
  const store = createFirebaseNotificationStore({ db, Timestamp });
  const deliver = createAppsScriptDelivery({ config: webhookConfig, fetchImpl });
  const queue = createNotificationQueue({ store, deliver, logger });

  return {
    enqueueLead: queue.enqueue,
    drain: queue.drain,
    start: queue.start,
    stop: queue.stop,
  };
}
