import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowser({ storageBlocked = false, globalPrivacyControl = false } = {}) {
  const values = new Map();
  const listeners = new Map();
  const localStorage = {
    getItem(key) {
      if (storageBlocked) throw new Error('Storage blocked for test.');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (storageBlocked) throw new Error('Storage blocked for test.');
      values.set(key, String(value));
    },
  };
  const windowStub = {
    localStorage,
    addEventListener(name, listener) {
      const handlers = listeners.get(name) || new Set();
      handlers.add(listener);
      listeners.set(name, handlers);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    },
  };
  Object.defineProperty(globalThis, 'window', { value: windowStub, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { globalPrivacyControl }, configurable: true });
  Object.defineProperty(globalThis, 'CustomEvent', {
    value: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    },
    configurable: true,
  });
  return windowStub;
}

test('retains opt-out in memory when browser storage is blocked', async () => {
  installBrowser({ storageBlocked: true });
  const privacy = await import('../src/privacyChoices.js?storage-blocked');
  privacy.setMeasurementChoice(privacy.MEASUREMENT_CHOICES.OPT_OUT);
  assert.equal(privacy.getMeasurementChoice(), privacy.MEASUREMENT_CHOICES.OPT_OUT);
  assert.equal(privacy.isMeasurementAllowed(), false);
});

test('Global Privacy Control overrides an allow choice', async () => {
  installBrowser({ globalPrivacyControl: true });
  const privacy = await import('../src/privacyChoices.js?gpc');
  privacy.setMeasurementChoice(privacy.MEASUREMENT_CHOICES.ALLOW);
  assert.equal(privacy.getMeasurementChoice(), privacy.MEASUREMENT_CHOICES.OPT_OUT);
  assert.equal(privacy.isMeasurementAllowed(), false);
});
