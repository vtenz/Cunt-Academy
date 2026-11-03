/**
 * Cunt Academy v4.7 - Bidirectional Website <-> Extension Content Script Bridge (`site-bridge.js`)
 * Automatically synchronizes saved vocabulary cards (`lt_saved_cards_v3`), Gmail account identity,
 * and Gemini API key between the Cunt Academy browser extension and https://cunt-academy.netlify.app/
 */
(function () {
  'use strict';

  const Constants = globalThis.LTConstants;
  const ext = Constants && typeof Constants.getExtApi === 'function'
    ? Constants.getExtApi()
    : (typeof browser !== 'undefined' ? browser : null);

  if (!ext || !ext.runtime || typeof ext.runtime.sendMessage !== 'function') {
    return;
  }

  function sendToBackground(payload) {
    return new Promise((resolve) => {
      try {
        let settled = false;
        const maybePromise = ext.runtime.sendMessage(payload, (resp) => {
          if (!settled) {
            settled = true;
            resolve(resp || null);
          }
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise
            .then((resp) => {
              if (!settled) {
                settled = true;
                resolve(resp || null);
              }
            })
            .catch(() => {
              if (!settled) {
                settled = true;
                resolve(null);
              }
            });
        }
      } catch (_e) {
        resolve(null);
      }
    });
  }

  async function pullFromExtensionAndPostToWebsite() {
    const res = await sendToBackground({ type: 'LT_WEB_BRIDGE_PULL' });
    if (res && res.ok) {
      window.postMessage(
        {
          source: 'CUNT_ACADEMY_EXTENSION',
          type: 'EXTENSION_SYNC_PAYLOAD',
          cards: Array.isArray(res.cards) ? res.cards : [],
          cloudAccount: res.cloudAccount || null,
          geminiApiKey: res.geminiApiKey || ''
        },
        '*'
      );
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'CUNT_ACADEMY_WEBSITE') return;

    if (data.type === 'REQUEST_EXTENSION_SYNC') {
      await pullFromExtensionAndPostToWebsite();
    } else if (data.type === 'PUSH_WEBSITE_STATE') {
      await sendToBackground({
        type: 'LT_WEB_BRIDGE_PUSH',
        cards: Array.isArray(data.cards) ? data.cards : [],
        cloudAccount: data.cloudAccount || null,
        geminiApiKey: data.geminiApiKey || ''
      });
    }
  });

  // Announce extension presence and sync cards immediately when https://cunt-academy.netlify.app/ opens
  pullFromExtensionAndPostToWebsite();
})();
