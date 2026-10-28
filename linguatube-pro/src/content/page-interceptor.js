/**
 * LinguaTube Pro v3.2 — Page-Level Network & Player Interceptor (MAIN World)
 * 1. Passively captures the response body of YouTube's signed /api/timedtext XHR & fetch calls
 *    (which include YouTube's anti-bot &pot= Proof-of-Origin token).
 * 2. Strictly deduplicates URLs so it can never cause recursive network calls.
 * 3. Only probes player captions on /watch video pages — completely idle on YouTube Home/Search.
 */
(function () {
  'use strict';

  if (window.__linguaTubeInterceptorInstalled) {
    return;
  }
  window.__linguaTubeInterceptorInstalled = true;

  const seenUrls = new Set();
  const upgradedPotUrls = new Set();
  let lastPayloadSig = '';
  let autoClickedCcForVideoId = '';
  let lastProbedVideoId = '';

  function isWatchPage() {
    try {
      return window.location.pathname.startsWith('/watch');
    } catch (_err) {
      return false;
    }
  }

  function getCurrentVideoId() {
    try {
      if (!isWatchPage()) return '';
      const url = new URL(window.location.href);
      return url.searchParams.get('v') || '';
    } catch (_err) {
      return '';
    }
  }

  function normalizeTimedTextUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      if (!parsed.pathname.includes('/api/timedtext')) return null;
      parsed.searchParams.delete('tlang');
      parsed.searchParams.set('fmt', 'json3');
      return {
        url: parsed.toString(),
        hasPot: parsed.searchParams.has('pot'),
        videoId: parsed.searchParams.get('v') || getCurrentVideoId()
      };
    } catch (_err) {
      return null;
    }
  }

  function emitTimedTextPayload(rawUrl, bodyText, sourceType) {
    if (!bodyText || typeof bodyText !== 'string') return;
    const trimmed = bodyText.trim();
    if (trimmed.length < 15) return;

    const vid = getCurrentVideoId();
    const normalized = rawUrl ? normalizeTimedTextUrl(rawUrl) : null;
    if (vid && normalized && normalized.videoId && normalized.videoId !== vid) {
      return;
    }
    const sig = `${vid}:${trimmed.length}:${trimmed.slice(0, 64)}`;
    if (sig === lastPayloadSig) return;
    lastPayloadSig = sig;

    window.dispatchEvent(
      new CustomEvent('LINGUATUBE_TIMEDTEXT_PAYLOAD', {
        detail: {
          url: rawUrl || '',
          bodyText: trimmed,
          videoId: vid,
          source: sourceType || 'network-body'
        }
      })
    );
  }

  function emitTimedTextEvent(rawUrl, sourceType) {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    const normalized = normalizeTimedTextUrl(rawUrl);
    if (!normalized || !normalized.url) return;
    const pageVid = getCurrentVideoId();
    if (pageVid && normalized.videoId && normalized.videoId !== pageVid) {
      return;
    }

    const dedupeKey = `${sourceType}:${normalized.url}`;
    if (seenUrls.has(dedupeKey)) return;
    seenUrls.add(dedupeKey);
    if (seenUrls.size > 80) {
      const first = seenUrls.values().next().value;
      seenUrls.delete(first);
    }

    window.dispatchEvent(
      new CustomEvent('LINGUATUBE_TIMEDTEXT_URL', {
        detail: {
          url: normalized.url,
          videoId: normalized.videoId,
          source: sourceType || 'network'
        }
      })
    );

    // If YouTube's player made a signed &pot= request that wasn't json3, fetch json3 once using originalFetch
    if (
      normalized.hasPot &&
      sourceType !== 'json3-upgrade' &&
      normalized.url !== rawUrl &&
      !upgradedPotUrls.has(normalized.url)
    ) {
      upgradedPotUrls.add(normalized.url);
      originalFetch
        .call(window, normalized.url, { credentials: 'same-origin' })
        .then(function (r) {
          return r && r.ok ? r.text() : '';
        })
        .then(function (txt) {
          if (txt && txt.trim().length > 15) {
            emitTimedTextPayload(normalized.url, txt, 'json3-upgrade');
          }
        })
        .catch(function () {});
    }
  }

  // 1. Passively hook window.fetch in MAIN world for /api/timedtext
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function (input, init) {
      let reqUrl = '';
      try {
        reqUrl = typeof input === 'string' ? input : input && input.url ? String(input.url) : '';
      } catch (_err) {
        reqUrl = '';
      }

      const fetchPromise = originalFetch.apply(this, arguments);

      if (reqUrl && reqUrl.includes('/api/timedtext')) {
        try {
          emitTimedTextEvent(reqUrl, 'fetch');
          fetchPromise
            .then(function (response) {
              if (!response || typeof response.clone !== 'function') return;
              response
                .clone()
                .text()
                .then(function (bodyText) {
                  if (bodyText && bodyText.trim().length > 15) {
                    emitTimedTextPayload(reqUrl, bodyText, 'fetch-body');
                  }
                })
                .catch(function () {});
            })
            .catch(function () {});
        } catch (_e) {}
      }

      return fetchPromise;
    };
  }

  // 2. Passively hook XMLHttpRequest.prototype.open in MAIN world for /api/timedtext
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (typeof url === 'string' && url.includes('/api/timedtext')) {
        emitTimedTextEvent(url, 'xhr');
        this.addEventListener(
          'load',
          function () {
            try {
              if (typeof this.responseText === 'string' && this.responseText.trim().length > 15) {
                emitTimedTextPayload(url, this.responseText, 'xhr-body');
              }
            } catch (_e) {}
          },
          { once: true }
        );
      }
    } catch (_err) {
      // Never break page XHR
    }
    return originalXhrOpen.apply(this, arguments);
  };

  // 3. Probe captionTracks ONLY on /watch pages and at most once per videoId
  function probePlayerCaptions(force) {
    try {
      if (!isWatchPage()) return;
      const vid = getCurrentVideoId();
      if (!vid) return;
      if (!force && lastProbedVideoId === vid) return;
      lastProbedVideoId = vid;

      const player = document.getElementById('movie_player');
      let playerResponse = null;

      if (player && typeof player.getPlayerResponse === 'function') {
        playerResponse = player.getPlayerResponse();
      }
      if (!playerResponse && window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
      }

      const tracklist =
        playerResponse &&
        playerResponse.captions &&
        playerResponse.captions.playerCaptionsTracklistRenderer;

      let preferredTrack = null;
      if (tracklist && Array.isArray(tracklist.captionTracks) && tracklist.captionTracks.length > 0) {
        preferredTrack =
          tracklist.captionTracks.find(function (t) {
            return t.languageCode && t.languageCode.startsWith('en') && t.kind !== 'asr';
          }) ||
          tracklist.captionTracks.find(function (t) {
            return t.languageCode && t.languageCode.startsWith('en');
          }) ||
          tracklist.captionTracks[0];

        if (preferredTrack && preferredTrack.baseUrl) {
          emitTimedTextEvent(preferredTrack.baseUrl, 'playerResponse');
        }
      }

      // If no timedtext payload arrived after 900ms on a /watch page and CC button is off, click it once
      setTimeout(function () {
        try {
          if (!isWatchPage() || getCurrentVideoId() !== vid) return;
          if (lastPayloadSig.startsWith(vid + ':')) return;
          if (autoClickedCcForVideoId === vid) return;
          const ccBtn = document.querySelector('#movie_player .ytp-subtitles-button');
          if (ccBtn && ccBtn.getAttribute('aria-pressed') === 'false') {
            autoClickedCcForVideoId = vid;
            ccBtn.click();
          }
        } catch (_e) {}
      }, 900);
    } catch (_err) {
      // Ignore player probe errors
    }
  }

  window.addEventListener('yt-navigate-finish', function () {
    lastProbedVideoId = '';
    setTimeout(function () {
      probePlayerCaptions(true);
    }, 350);
  });

  window.addEventListener('LINGUATUBE_REQUEST_PROBE', function () {
    probePlayerCaptions(true);
  });

  window.addEventListener('LINGUATUBE_PLAYER_COMMAND', function (event) {
    try {
      const detail = (event && event.detail) || {};
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (!video) return;
      if (detail.command === 'seek' && typeof detail.timeSec === 'number') {
        video.currentTime = Math.max(0, detail.timeSec);
      } else if (detail.command === 'pause') {
        video.pause();
      } else if (detail.command === 'play') {
        video.play();
      } else if (detail.command === 'toggle') {
        if (video.paused) video.play();
        else video.pause();
      }
    } catch (_err) {}
  });

  if (isWatchPage()) {
    setTimeout(function () {
      probePlayerCaptions(false);
    }, 400);
  }
})();

