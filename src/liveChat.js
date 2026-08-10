const TAWK_SCRIPT_ID = 'nexora-tawk-script';
const TAWK_SCRIPT_URL = 'https://embed.tawk.to/6a5a8c2868d1471d494e36b8/1jtor701g';

let chatPromise;

function announceReady() {
  window.__NEXORA_TAWK_READY__ = true;
  window.dispatchEvent(new CustomEvent('nexora:tawk-ready'));
}

export function loadLiveChat() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Live chat requires a browser.'));
  if (window.__NEXORA_TAWK_READY__ && window.Tawk_API?.maximize) return Promise.resolve(window.Tawk_API);
  if (chatPromise) return chatPromise;

  chatPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Live chat did not load.')), 8000);
    const finish = () => {
      window.clearTimeout(timeout);
      announceReady();
      window.Tawk_API?.showWidget?.();
      resolve(window.Tawk_API);
    };

    window.Tawk_API = window.Tawk_API || {};
    const previousOnLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = () => {
      if (typeof previousOnLoad === 'function') previousOnLoad();
      finish();
    };
    window.Tawk_LoadStart = new Date();

    const existingScript = document.getElementById(TAWK_SCRIPT_ID);
    if (existingScript) {
      if (window.Tawk_API?.maximize) finish();
      return;
    }

    const script = document.createElement('script');
    script.id = TAWK_SCRIPT_ID;
    script.async = true;
    script.src = TAWK_SCRIPT_URL;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      chatPromise = undefined;
      reject(new Error('Live chat was blocked by the browser.'));
    }, { once: true });
    document.head.appendChild(script);
  });

  return chatPromise;
}

export function scheduleLiveChat() {
  if (typeof window === 'undefined') return () => {};
  let timer;
  const start = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadLiveChat().catch(() => {}), { timeout: 4000 });
    } else {
      timer = window.setTimeout(() => loadLiveChat().catch(() => {}), 2500);
    }
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  return () => {
    window.removeEventListener('load', start);
    if (timer) window.clearTimeout(timer);
  };
}

export async function openLiveChat() {
  const api = await loadLiveChat();
  api.showWidget?.();
  api.maximize?.();
}
