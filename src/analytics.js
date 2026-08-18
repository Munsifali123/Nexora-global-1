import { isMeasurementAllowed, subscribeMeasurementChoice } from './privacyChoices';

let analyticsClientPromise;

async function getAnalyticsClient({ ignoreChoice = false } = {}) {
  if (typeof window === 'undefined') return null;
  if (!ignoreChoice && !isMeasurementAllowed()) return null;
  if (!analyticsClientPromise) {
    analyticsClientPromise = Promise.all([
      import('firebase/analytics'),
      import('./firebase'),
    ]).then(async ([analyticsModule, firebaseModule]) => {
      if (!(await analyticsModule.isSupported())) return null;
      return {
        analytics: analyticsModule.getAnalytics(firebaseModule.getFirebaseApp()),
        logEvent: analyticsModule.logEvent,
        setAnalyticsCollectionEnabled: analyticsModule.setAnalyticsCollectionEnabled,
      };
    }).catch((error) => {
      console.info('Analytics is unavailable:', error);
      return null;
    });
  }
  return analyticsClientPromise;
}

if (typeof window !== 'undefined') {
  subscribeMeasurementChoice(async () => {
    if (!analyticsClientPromise && !isMeasurementAllowed()) return;
    const client = await getAnalyticsClient({ ignoreChoice: true });
    client?.setAnalyticsCollectionEnabled(client.analytics, isMeasurementAllowed());
  });
}

export function trackEvent(name, parameters = {}) {
  if (typeof window === 'undefined' || !isMeasurementAllowed()) return;
  const record = async () => {
    if (!isMeasurementAllowed()) return;
    const client = await getAnalyticsClient();
    if (client) client.logEvent(client.analytics, name, parameters);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(record, { timeout: 2000 });
  } else {
    window.setTimeout(record, 0);
  }
}
