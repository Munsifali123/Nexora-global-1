let analyticsClientPromise;

async function getAnalyticsClient() {
  if (typeof window === 'undefined') return null;
  if (!analyticsClientPromise) {
    analyticsClientPromise = Promise.all([
      import('firebase/analytics'),
      import('./firebase'),
    ]).then(async ([analyticsModule, firebaseModule]) => {
      if (!(await analyticsModule.isSupported())) return null;
      return {
        analytics: analyticsModule.getAnalytics(firebaseModule.getFirebaseApp()),
        logEvent: analyticsModule.logEvent,
      };
    }).catch((error) => {
      console.info('Analytics is unavailable:', error);
      return null;
    });
  }
  return analyticsClientPromise;
}

export function trackEvent(name, parameters = {}) {
  if (typeof window === 'undefined') return;
  const record = async () => {
    const client = await getAnalyticsClient();
    if (client) client.logEvent(client.analytics, name, parameters);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(record, { timeout: 2000 });
  } else {
    window.setTimeout(record, 0);
  }
}
