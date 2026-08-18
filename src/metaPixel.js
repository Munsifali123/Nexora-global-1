import {
  isMeasurementAllowed,
  subscribeMeasurementChoice,
} from './privacyChoices.js';

const RAW_META_PIXEL_ID = typeof import.meta.env !== 'undefined'
  ? import.meta.env.VITE_META_PIXEL_ID
  : (typeof process !== 'undefined' ? process.env.VITE_META_PIXEL_ID : undefined);
const META_PIXEL_ID = String(RAW_META_PIXEL_ID || '').trim();
const META_PIXEL_ID_PATTERN = /^\d{5,30}$/;
const META_PIXEL_SCRIPT_ID = 'nexora-meta-pixel';

let initialized = false;
let choiceSubscriptionInstalled = false;
let consentState = null;
let lastTrackedUrl = null;
const trackedLeadKeys = new Set();

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isConfigured() {
  return META_PIXEL_ID_PATTERN.test(META_PIXEL_ID);
}

function installPixelQueue() {
  if (typeof window.fbq === 'function') return window.fbq;

  const fbq = function metaPixelQueue() {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, arguments);
    } else {
      fbq.queue.push(arguments);
    }
  };

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  return fbq;
}

function loadPixelScript() {
  if (document.getElementById(META_PIXEL_SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
}

function setMetaConsent(allowed) {
  if (!initialized || typeof window.fbq !== 'function') return;

  const nextState = allowed ? 'granted' : 'revoked';
  if (consentState === nextState) return;
  window.fbq('consent', allowed ? 'grant' : 'revoke');
  consentState = nextState;
}

function ensureInitialized() {
  if (!isBrowser() || !isConfigured() || !isMeasurementAllowed()) return false;
  if (initialized) {
    setMetaConsent(true);
    return true;
  }

  const fbq = installPixelQueue();
  fbq('consent', 'grant');
  consentState = 'granted';
  fbq('set', 'autoConfig', false, META_PIXEL_ID);
  fbq('init', META_PIXEL_ID);
  loadPixelScript();
  initialized = true;
  return true;
}

function handleMeasurementChoiceChange() {
  const allowed = isMeasurementAllowed();
  if (!initialized) {
    if (allowed) ensureInitialized();
    return;
  }
  setMetaConsent(allowed);
}

function installChoiceSubscription() {
  if (choiceSubscriptionInstalled || !isBrowser() || !isConfigured()) return;
  choiceSubscriptionInstalled = true;
  subscribeMeasurementChoice(handleMeasurementChoiceChange);
}

function normalizePageUrl(url) {
  if (!isBrowser()) return null;
  try {
    const normalized = new URL(url || window.location.href, window.location.href);
    normalized.hash = '';
    return normalized.href;
  } catch {
    return null;
  }
}

export function initializeMetaPixel() {
  if (!isBrowser() || !isConfigured()) return false;
  installChoiceSubscription();
  return ensureInitialized();
}

export function trackMetaPageView(url) {
  if (!initializeMetaPixel() || !isMeasurementAllowed()) return false;

  const normalizedUrl = normalizePageUrl(url);
  if (!normalizedUrl || normalizedUrl === lastTrackedUrl) return false;

  window.fbq('track', 'PageView');
  lastTrackedUrl = normalizedUrl;
  return true;
}

export function trackMetaLead(submissionKey) {
  const internalKey = String(submissionKey || '').trim();
  if (!internalKey || trackedLeadKeys.has(internalKey)) return false;
  trackedLeadKeys.add(internalKey);
  if (!initializeMetaPixel() || !isMeasurementAllowed()) return false;
  window.fbq('track', 'Lead');
  return true;
}

export function isMetaPixelConfigured() {
  return isConfigured();
}
