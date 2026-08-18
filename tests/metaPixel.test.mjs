import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowser({ url = 'https://www.nexoraglobal.agency/' } = {}) {
  const storedValues = new Map();
  const listeners = new Map();
  const scripts = [];

  const windowStub = {
    location: { href: url },
    localStorage: {
      getItem(key) { return storedValues.get(key) ?? null; },
      setItem(key, value) { storedValues.set(key, String(value)); },
    },
    addEventListener(name, listener) {
      const eventListeners = listeners.get(name) || new Set();
      eventListeners.add(listener);
      listeners.set(name, eventListeners);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
  };

  const documentStub = {
    head: {
      appendChild(script) { scripts.push(script); },
    },
    createElement(tagName) { return { tagName }; },
    getElementById(id) { return scripts.find((script) => script.id === id) || null; },
  };

  Object.defineProperty(globalThis, 'window', { value: windowStub, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: { globalPrivacyControl: false },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'CustomEvent', {
    value: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    configurable: true,
  });

  return { scripts, windowStub };
}

function queuedCalls(windowStub) {
  return windowStub.fbq.queue.map((args) => Array.from(args));
}

async function importMetaPixel(label, pixelId) {
  if (pixelId === undefined) delete process.env.VITE_META_PIXEL_ID;
  else process.env.VITE_META_PIXEL_ID = pixelId;
  return import(`../src/metaPixel.js?test=${label}`);
}

test('is a complete no-op when VITE_META_PIXEL_ID is missing or invalid', async () => {
  let browser = installBrowser();
  let metaPixel = await importMetaPixel('missing', undefined);
  assert.equal(metaPixel.isMetaPixelConfigured(), false);
  assert.equal(metaPixel.initializeMetaPixel(), false);
  assert.equal(metaPixel.trackMetaPageView(), false);
  assert.equal(metaPixel.trackMetaLead('internal-key'), false);
  assert.equal(browser.windowStub.fbq, undefined);
  assert.equal(browser.scripts.length, 0);

  browser = installBrowser();
  metaPixel = await importMetaPixel('invalid', 'not-a-pixel-id');
  assert.equal(metaPixel.isMetaPixelConfigured(), false);
  assert.equal(metaPixel.trackMetaPageView(), false);
  assert.equal(browser.windowStub.fbq, undefined);
  assert.equal(browser.scripts.length, 0);
});

test('initializes once and manually tracks only unique, parameter-free PageViews', async () => {
  const browser = installBrowser();
  const metaPixel = await importMetaPixel('pageviews', '123456789012345');

  assert.equal(metaPixel.trackMetaPageView(), true);
  assert.equal(metaPixel.trackMetaPageView(), false);
  assert.equal(metaPixel.trackMetaPageView('https://www.nexoraglobal.agency/#contact'), false);
  assert.equal(metaPixel.trackMetaPageView('https://www.nexoraglobal.agency/about'), true);

  const calls = queuedCalls(browser.windowStub);
  assert.equal(calls.filter(([command]) => command === 'init').length, 1);
  assert.deepEqual(calls.find(([command]) => command === 'set'), [
    'set',
    'autoConfig',
    false,
    '123456789012345',
  ]);
  assert.ok(
    calls.findIndex(([command]) => command === 'set')
      < calls.findIndex(([command]) => command === 'init'),
    'automatic configuration must be disabled before Pixel initialization',
  );
  const pageViews = calls.filter(([command, event]) => command === 'track' && event === 'PageView');
  assert.deepEqual(pageViews, [['track', 'PageView'], ['track', 'PageView']]);
  assert.equal(browser.scripts.length, 1);
  assert.equal(browser.scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
});

test('tracks a parameter-free Lead only once per internal submission key', async () => {
  const browser = installBrowser();
  const metaPixel = await importMetaPixel('leads', '123456789012345');

  assert.equal(metaPixel.trackMetaLead('firestore-document-one'), true);
  assert.equal(metaPixel.trackMetaLead('firestore-document-one'), false);
  assert.equal(metaPixel.trackMetaLead('firestore-document-two'), true);

  const calls = queuedCalls(browser.windowStub);
  const leads = calls.filter(([command, event]) => command === 'track' && event === 'Lead');
  assert.deepEqual(leads, [['track', 'Lead'], ['track', 'Lead']]);
  assert.equal(JSON.stringify(calls).includes('firestore-document'), false);
});

test('revokes on opt-out, grants on opt-in, and never bypasses GPC', async () => {
  const browser = installBrowser();
  const metaPixel = await importMetaPixel('consent', '123456789012345');
  const { MEASUREMENT_CHOICES, setMeasurementChoice } = await import('../src/privacyChoices.js');

  assert.equal(metaPixel.trackMetaPageView(), true);
  setMeasurementChoice(MEASUREMENT_CHOICES.OPT_OUT);
  assert.equal(metaPixel.trackMetaPageView('https://www.nexoraglobal.agency/about'), false);
  assert.equal(metaPixel.trackMetaLead('lead-created-during-opt-out'), false);

  setMeasurementChoice(MEASUREMENT_CHOICES.ALLOW);
  assert.equal(metaPixel.trackMetaPageView('https://www.nexoraglobal.agency/about'), true);
  assert.equal(metaPixel.trackMetaLead('lead-created-during-opt-out'), false);

  Object.defineProperty(globalThis, 'navigator', {
    value: { globalPrivacyControl: true },
    configurable: true,
  });
  setMeasurementChoice(MEASUREMENT_CHOICES.ALLOW);
  assert.equal(metaPixel.trackMetaPageView('https://www.nexoraglobal.agency/contact'), false);

  const calls = queuedCalls(browser.windowStub);
  const consentCalls = calls.filter(([command]) => command === 'consent');
  assert.deepEqual(consentCalls, [
    ['consent', 'grant'],
    ['consent', 'revoke'],
    ['consent', 'grant'],
    ['consent', 'revoke'],
  ]);
});
