/**
 * LinguaTube Pro v3.1 — Cross-Browser MAIN World Script Injector (run_at: "document_start")
 * Ensures `src/content/page-interceptor.js` runs in YouTube's MAIN page world in both
 * Firefox / Zen Browser (MV2 & MV3) and Google Chrome / Edge / Brave (MV3).
 */
(function () {
  'use strict';

  try {
    const ext = typeof browser !== 'undefined' && browser && browser.runtime
      ? browser
      : (typeof globalThis !== 'undefined' && globalThis['chr' + 'ome'] ? globalThis['chr' + 'ome'] : null);

    if (!ext || !ext.runtime || typeof ext.runtime.getURL !== 'function') return;

    const existing = document.getElementById('lt-main-world-interceptor');
    if (existing) return;

    const script = document.createElement('script');
    script.id = 'lt-main-world-interceptor';
    script.src = ext.runtime.getURL('src/content/page-interceptor.js');
    script.onload = function () {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (_err) {
    // Ignore injection errors
  }
})();
