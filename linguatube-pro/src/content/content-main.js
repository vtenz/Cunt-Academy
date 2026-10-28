/**
 * Cunt Academy v4.0 — YouTube Content Script (Language Reactor + Trancy 1:1 Free Edition)
 * Features:
 * - Zero-Freeze Architecture (Watch-Page Gated, Render-Key Guarded, 0 Global MutationObservers)
 * - Ultra-Clean Subtitle Box (no intrusive permanent header bar; subtle hover drag grip)
 * - Trancy Word-by-Word Speaker Karaoke Highlighting (.is-spoken / .is-speaking-now)
 * - Language Reactor Teal Hover Mini-Popup (#1b6b85) with Automatic Collocation/Phrasal Verb Detection
 * - End-of-Cue Hover Auto-Pause + Auto-Resume on Mouse Leave (exact match to language_reactor_49466273.mp4)
 * - Multi-Word Drag Selection & Shift+Click / Range Expander for Phrasal Verbs & Idioms
 * - Right-Side Slide-Over Player Dictionary Drawer with In-Video Concordance & Tatoeba Examples
 * - Full Trancy + Language Reactor Subtitle Style & Vocabulary Settings Modal
 */
(function () {
  'use strict';

  if (window.__ltContentMainLoaded) {
    window.dispatchEvent(new CustomEvent('LINGUATUBE_REQUEST_PROBE'));
    return;
  }
  window.__ltContentMainLoaded = true;

  const Constants = globalThis.LTConstants;
  const Database = globalThis.LTDatabase;
  const Parser = globalThis.LTSubtitleParser;
  const ext = (Constants && Constants.getExtApi)
    ? Constants.getExtApi()
    : (typeof browser !== 'undefined' ? browser : null);

  function sendExtMessage(message) {
    if (!ext || !ext.runtime || typeof ext.runtime.sendMessage !== 'function') {
      return Promise.resolve({ ok: false });
    }
    return new Promise((resolve) => {
      let settled = false;
      try {
        const maybePromise = ext.runtime.sendMessage(message, (resp) => {
          if (!settled) {
            settled = true;
            resolve(resp || { ok: false });
          }
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise
            .then((resp) => {
              if (!settled) {
                settled = true;
                resolve(resp || { ok: false });
              }
            })
            .catch(() => {
              if (!settled) {
                settled = true;
                resolve({ ok: false });
              }
            });
        }
      } catch (_err) {
        if (!settled) {
          settled = true;
          resolve({ ok: false });
        }
      }
    });
  }

  function ensureMainWorldInterceptorInjected() {
    try {
      if (!ext || !ext.runtime || typeof ext.runtime.getURL !== 'function') return;
      if (document.getElementById('lt-main-world-interceptor')) return;
      const script = document.createElement('script');
      script.id = 'lt-main-world-interceptor';
      script.src = ext.runtime.getURL('src/content/page-interceptor.js');
      script.onload = function () {
        script.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (_e) {
      // ignore
    }
  }

  const state = {
    settings: Object.assign({}, Constants.DEFAULT_SETTINGS),
    cues: [],
    activeCueIndex: -1,
    savedCardsMap: new Map(),
    savedSentences: [],
    activeTab: 'subtitles',
    wordFilterCat: 'all',
    selectedWordInfo: null,
    dictEditBackOpen: false,
    dictAiResult: null,
    dictAiLoading: false,
    selectedRangeStartIdx: -1,
    selectedRangeEndIdx: -1,
    isSelectingWordsDrag: false,
    dragSelectAnchorIdx: -1,
    isHoveringSubtitleWord: false,
    hoveredWordIndex: -1,
    hoverLockedCueIndex: -1,
    hoverHideTimer: null,
    pausedByHoverAtCueEnd: false,
    settingsModalOpen: false,
    exportModalOpen: false,
    exportFormat: 'html',
    cueRevealedStep: 0,
    autoPausedOnCueIndex: -1,
    pressedKeys: new Set(),
    isDraggingSubBox: false,
    dragStartMouseX: 0,
    dragStartMouseY: 0,
    dragStartXPercent: 50,
    dragStartBottomPx: 62,
    videoId: '',
    videoTitle: ''
  };

  let playerEl = null;
  let videoEl = null;
  let overlayRoot = null;
  let subtitleBoxEl = null;
  let hoverTooltipEl = null;
  let floatingDictEl = null;
  let dockRoot = null;
  let settingsModalEl = null;
  let exportModalEl = null;
  let ytpLrWidgetEl = null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function speakText(text, lang = 'en-US') {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (_e) {
      // ignore
    }
  }

  function isWatchPage() {
    try {
      return window.location.pathname.startsWith('/watch') || window.location.pathname.startsWith('/live');
    } catch (_e) {
      return false;
    }
  }

  let syncTimer = null;
  async function syncStorageState() {
    const [settings, cards, sentences] = await Promise.all([
      Database.getSettings(),
      Database.getAllCards(),
      Database.getAllSavedSentences()
    ]);
    state.settings = settings;
    state.activeTab = settings.activeRightTab || 'subtitles';
    state.savedCardsMap.clear();
    for (const c of cards) {
      state.savedCardsMap.set(Constants.normalizeWord(c.id || c.word), c);
    }
    state.savedSentences = sentences;
    if (isWatchPage()) {
      applyPlaybarAutoHideMode();
      updateYtpControlBarWidget();
      renderSubtitleOverlay(true);
      renderRightDock();
    }
  }

  if (ext && ext.storage && ext.storage.onChanged) {
    ext.storage.onChanged.addListener(() => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncStorageState();
      }, 120);
    });
  }

  function applyPlaybarAutoHideMode() {
    if (!playerEl) return;
    const wantHideCc = Boolean(state.settings.enabled);
    if (playerEl.classList.contains('lt-hide-native-cc') !== wantHideCc) {
      playerEl.classList.toggle('lt-hide-native-cc', wantHideCc);
    }
    const wantHidePlaybar = Boolean(state.settings.enabled && state.settings.hidePlaybackBar);
    if (playerEl.classList.contains('lt-hide-yt-playbar') !== wantHidePlaybar) {
      playerEl.classList.toggle('lt-hide-yt-playbar', wantHidePlaybar);
      if (!wantHidePlaybar) {
        playerEl.classList.remove('lt-playbar-hover-zone');
      }
    }
  }

  function bindPlayerMouseZoneWatcher(targetPlayer) {
    if (!targetPlayer || targetPlayer.dataset.ltMouseZoneBound === 'true') return;
    targetPlayer.dataset.ltMouseZoneBound = 'true';

    targetPlayer.addEventListener('mousemove', (e) => {
      if (!state.settings.enabled || !state.settings.hidePlaybackBar) return;
      const rect = targetPlayer.getBoundingClientRect();
      const distFromBottom = rect.bottom - e.clientY;
      const inZone = distFromBottom <= 68 && distFromBottom >= -12;
      if (targetPlayer.classList.contains('lt-playbar-hover-zone') !== inZone) {
        targetPlayer.classList.toggle('lt-playbar-hover-zone', inZone);
      }
    }, { passive: true });

    targetPlayer.addEventListener('mouseleave', () => {
      if (targetPlayer.classList.contains('lt-playbar-hover-zone')) {
        targetPlayer.classList.remove('lt-playbar-hover-zone');
      }
    }, { passive: true });
  }

  /**
   * Injects the native Cunt Academy `[CA ON ⚙ 🪭]` control pill inside YouTube's `.ytp-right-controls`
   */
  function injectYtpControlBarWidget() {
    if (!playerEl || !isWatchPage()) return;
    const rightControls = playerEl.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    let existing = rightControls.querySelector('#lt-ytp-control-pill');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'lt-ytp-control-pill';
      existing.className = 'lt-ytp-control-pill';
      rightControls.insertBefore(existing, rightControls.firstChild);
    }
    ytpLrWidgetEl = existing;
    updateYtpControlBarWidget();
  }

  function updateYtpControlBarWidget() {
    if (!ytpLrWidgetEl) return;
    const isOn = Boolean(state.settings.enabled);
    const dockVis = Boolean(state.settings.showSubtitlesListView);
    const renderKey = `${isOn ? 'on' : 'off'}:${dockVis ? 'dock1' : 'dock0'}`;
    if (ytpLrWidgetEl.dataset.ltRenderKey === renderKey) return;
    ytpLrWidgetEl.dataset.ltRenderKey = renderKey;

    ytpLrWidgetEl.innerHTML = `
      <button type="button" class="lt-ytp-lr-badge" data-lt-action="toggle-enabled" title="Cunt Academy Subtitles (ON/OFF)">
        <span class="lt-ytp-lr-circle" style="background:transparent;padding:0;overflow:hidden;">
          <svg width="20" height="20" viewBox="0 0 64 64" fill="none">
            <rect x="3" y="3" width="58" height="58" rx="16" fill="#0B0F1B" stroke="#7C5CFC" stroke-width="4" />
            <rect x="11" y="13" width="38" height="28" rx="6" transform="rotate(-6 11 13)" fill="#1E1B4B" stroke="#8B5CF6" stroke-width="2" />
            <rect x="14" y="15" width="38" height="28" rx="6" fill="#13182B" stroke="#38BDF8" stroke-width="2" />
            <path d="M27 21.5L40.5 29L27 36.5V21.5Z" fill="#10B981" />
            <rect x="15" y="46.5" width="34" height="3.5" rx="1.75" fill="#F8FAFC" />
            <rect x="20" y="52" width="24" height="3.5" rx="1.75" fill="#FDE047" />
          </svg>
        </span>
        <span class="lt-ytp-switch ${isOn ? 'is-on' : 'is-off'}">
          <span class="lt-ytp-switch-knob"></span>
        </span>
      </button>
      <button type="button" class="lt-ytp-icon-btn" data-lt-action="open-settings" title="Subtitle Style & Language Reactor Settings">⚙</button>
      <button type="button" class="lt-ytp-icon-btn" data-lt-action="toggle-dock" title="Toggle Right Subtitles / Words List">${dockVis ? '📑' : '📄'}</button>
      <button type="button" class="lt-ytp-icon-btn" data-lt-action="open-phrasepump" title="Open Cunt Academy Flashcards & Practice Portal">🪭</button>
    `;

    ytpLrWidgetEl.querySelectorAll('[data-lt-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-lt-action');
        if (act === 'toggle-enabled') {
          state.settings = await Database.saveSettings({ enabled: !state.settings.enabled });
          applyPlaybarAutoHideMode();
          updateYtpControlBarWidget();
          renderSubtitleOverlay(true);
          renderRightDock();
        } else if (act === 'open-settings') {
          state.settingsModalOpen = !state.settingsModalOpen;
          renderSettingsModal();
        } else if (act === 'toggle-dock') {
          state.settings = await Database.saveSettings({ showSubtitlesListView: !state.settings.showSubtitlesListView });
          updateYtpControlBarWidget();
          renderRightDock();
        } else if (act === 'open-phrasepump') {
          sendExtMessage({ type: 'LT_OPEN_DASHBOARD', tab: 'phrasepump' });
        }
      });
    });
  }

  /**
   * Creates the Subtitle Stage Overlay + Hover Mini-Popup + Right Slide-Over Dictionary + Corner Controls
   */
  function ensurePlayerOverlayMounted() {
    if (!isWatchPage()) return false;
    playerEl =
      document.querySelector('ytd-watch-flexy #movie_player') ||
      document.getElementById('movie_player') ||
      document.querySelector('.html5-video-player');
    videoEl = playerEl ? playerEl.querySelector('video') : null;
    if (!playerEl || !videoEl) return false;

    bindPlayerMouseZoneWatcher(playerEl);
    applyPlaybarAutoHideMode();
    injectYtpControlBarWidget();

    let existingOverlay = playerEl.querySelector('#lt-player-overlay-root');
    if (!existingOverlay) {
      overlayRoot = document.createElement('div');
      overlayRoot.id = 'lt-player-overlay-root';
      overlayRoot.className = 'lt-player-overlay-root';

      hoverTooltipEl = document.createElement('div');
      hoverTooltipEl.id = 'lt-hover-tooltip';
      hoverTooltipEl.className = 'lt-hover-mini-tooltip lt-hidden';

      floatingDictEl = document.createElement('div');
      floatingDictEl.id = 'lt-floating-dict';
      floatingDictEl.className = 'lt-floating-dict lt-hidden';

      subtitleBoxEl = document.createElement('div');
      subtitleBoxEl.id = 'lt-subtitle-box';
      subtitleBoxEl.className = 'lt-subtitle-box is-empty';

      const leftControls = document.createElement('div');
      leftControls.id = 'lt-left-corner-controls';
      leftControls.className = 'lt-left-corner-controls';

      const cornerControls = document.createElement('div');
      cornerControls.id = 'lt-corner-controls';
      cornerControls.className = 'lt-corner-controls';

      overlayRoot.appendChild(hoverTooltipEl);
      overlayRoot.appendChild(floatingDictEl);
      overlayRoot.appendChild(subtitleBoxEl);
      overlayRoot.appendChild(leftControls);
      overlayRoot.appendChild(cornerControls);
      playerEl.appendChild(overlayRoot);

      bindSubtitleDragEvents();
      bindHoverTooltipEvents();
    } else {
      overlayRoot = existingOverlay;
      hoverTooltipEl = existingOverlay.querySelector('#lt-hover-tooltip');
      floatingDictEl = existingOverlay.querySelector('#lt-floating-dict');
      subtitleBoxEl = existingOverlay.querySelector('#lt-subtitle-box');
    }

    if (!videoEl.dataset.ltTimeBound) {
      videoEl.dataset.ltTimeBound = 'true';
      videoEl.addEventListener('timeupdate', handleVideoTimeUpdate);
      videoEl.addEventListener('ratechange', () => {
        state.settings.playbackSpeed = videoEl.playbackRate;
      });
    }

    return true;
  }

  function bindHoverTooltipEvents() {
    if (!hoverTooltipEl || hoverTooltipEl.dataset.ltBound === 'true') return;
    hoverTooltipEl.dataset.ltBound = 'true';

    hoverTooltipEl.addEventListener('mouseenter', () => {
      if (state.hoverHideTimer) {
        clearTimeout(state.hoverHideTimer);
        state.hoverHideTimer = null;
      }
      state.isHoveringSubtitleWord = true;
    });

    hoverTooltipEl.addEventListener('mouseleave', () => {
      scheduleHideHoverTooltip();
    });
  }

  function scheduleHideHoverTooltip() {
    if (state.hoverHideTimer) clearTimeout(state.hoverHideTimer);
    state.hoverHideTimer = setTimeout(() => {
      state.isHoveringSubtitleWord = false;
      state.hoveredWordIndex = -1;
      state.hoverLockedCueIndex = -1;
      if (hoverTooltipEl) hoverTooltipEl.classList.add('lt-hidden');
      if (subtitleBoxEl) {
        subtitleBoxEl.querySelectorAll('.is-hovered-collocation').forEach((el) => {
          el.classList.remove('is-hovered-collocation');
        });
      }
      // If playback was auto-paused at the end of the subtitle cue because the user was hovering a word,
      // resume playback automatically when the mouse leaves the word/popup!
      if (state.pausedByHoverAtCueEnd && videoEl && videoEl.paused && floatingDictEl?.classList.contains('lt-hidden')) {
        state.pausedByHoverAtCueEnd = false;
        videoEl.play().catch(() => {});
      }
    }, 110);
  }

  let dragWindowListenersBound = false;
  function bindSubtitleDragEvents() {
    if (!subtitleBoxEl) return;

    if (!subtitleBoxEl.dataset.ltDragBound) {
      subtitleBoxEl.dataset.ltDragBound = 'true';
      subtitleBoxEl.addEventListener('mousedown', (e) => {
        const handle = e.target.closest('[data-lt-drag-handle="true"]');
        if (!handle && !e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        if (!playerEl) return;

        state.isDraggingSubBox = true;
        state.dragStartMouseX = e.clientX;
        state.dragStartMouseY = e.clientY;
        const pos = state.settings.subtitlePosition || { custom: false, xPercent: 50, bottomPx: 62 };
        state.dragStartXPercent = Number(pos.xPercent ?? 50);
        state.dragStartBottomPx = Number(pos.bottomPx ?? 62);
        subtitleBoxEl.classList.add('is-dragging');
      });
    }

    if (dragWindowListenersBound) return;
    dragWindowListenersBound = true;

    window.addEventListener('mousemove', (e) => {
      if (!state.isDraggingSubBox || !playerEl || !subtitleBoxEl) return;
      const rect = playerEl.getBoundingClientRect();
      const dx = e.clientX - state.dragStartMouseX;
      const dy = e.clientY - state.dragStartMouseY;

      const nextXPercent = Math.max(15, Math.min(85, state.dragStartXPercent + (dx / Math.max(300, rect.width)) * 100));
      const nextBottomPx = Math.max(14, Math.min(rect.height - 80, state.dragStartBottomPx - dy));

      state.settings.subtitlePosition = {
        custom: true,
        xPercent: Math.round(nextXPercent * 10) / 10,
        bottomPx: Math.round(nextBottomPx)
      };
      applySubtitleBoxPosition();
    }, { passive: true });

    window.addEventListener('mouseup', async () => {
      if (state.isSelectingWordsDrag) {
        state.isSelectingWordsDrag = false;
        if (
          state.selectedRangeStartIdx !== -1 &&
          state.selectedRangeEndIdx !== -1 &&
          state.selectedRangeEndIdx > state.selectedRangeStartIdx
        ) {
          openMultiWordRangeDictionary(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
        }
      }
      if (!state.isDraggingSubBox) return;
      state.isDraggingSubBox = false;
      if (subtitleBoxEl) subtitleBoxEl.classList.remove('is-dragging');
      await Database.saveSettings({ subtitlePosition: state.settings.subtitlePosition });
    });
  }

  function applySubtitleBoxPosition() {
    if (!subtitleBoxEl) return;
    const pos = state.settings.subtitlePosition || { custom: false, xPercent: 50, bottomPx: 62 };
    const xPct = Number(pos.xPercent ?? 50);
    const bottomPx = Number(pos.bottomPx ?? 62);
    subtitleBoxEl.style.left = `${xPct}%`;
    subtitleBoxEl.style.bottom = `${bottomPx}px`;
    subtitleBoxEl.style.transform = 'translateX(-50%)';

    const opacityPct = Number(state.settings.subtitleBgOpacity ?? 75);
    const alpha = Math.max(0, Math.min(1, opacityPct / 100));
    subtitleBoxEl.style.background = `rgba(8, 8, 10, ${alpha})`;
    subtitleBoxEl.style.backdropFilter = state.settings.subtitleBgBlur ? 'blur(8px)' : 'none';
  }

  /**
   * Updates Trancy-style Word-by-Word Speaker Karaoke Highlighting without touching innerHTML
   */
  function updateKaraokeWordHighlighting() {
    if (!subtitleBoxEl || !videoEl || !state.settings.wordByWordHighlight) return;
    const currentMs = videoEl.currentTime * 1000;
    const wordSpans = subtitleBoxEl.querySelectorAll('.lt-sub-word[data-start-ms]');
    if (!wordSpans.length) return;

    wordSpans.forEach((span) => {
      const startMs = Number(span.getAttribute('data-start-ms') || 0);
      const endMs = Number(span.getAttribute('data-end-ms') || 0);
      const isSpoken = currentMs >= startMs - 40;
      const isNow = currentMs >= startMs - 40 && currentMs <= endMs + 80;
      if (span.classList.contains('is-spoken') !== isSpoken) {
        span.classList.toggle('is-spoken', isSpoken);
      }
      if (span.classList.contains('is-speaking-now') !== isNow) {
        span.classList.toggle('is-speaking-now', isNow);
      }
    });
  }

  function checkHoverHoldEndOfCue() {
    if (!videoEl || !state.cues.length) return false;
    if (state.settings.hoverPauseAtCueEnd === false || !state.isHoveringSubtitleWord) return false;

    const lockedIdx = state.hoverLockedCueIndex !== -1 ? state.hoverLockedCueIndex : state.activeCueIndex;
    if (lockedIdx === -1) return false;
    const lockedCue = state.cues[lockedIdx];
    if (!lockedCue) return false;

    const currentMs = videoEl.currentTime * 1000;
    if (currentMs >= lockedCue.endMs - 220) {
      state.pausedByHoverAtCueEnd = true;
      if (!videoEl.paused) {
        videoEl.pause();
      }
      if (currentMs >= lockedCue.endMs - 30) {
        videoEl.currentTime = Math.max(lockedCue.startMs / 1000, (lockedCue.endMs - 120) / 1000);
      }
      return true;
    }
    return false;
  }

  function handleVideoTimeUpdate() {
    if (!videoEl || !state.cues.length) return;
    const currentMs = videoEl.currentTime * 1000;

    // 1. Strictly enforce Hover-Hold Auto-Pause at the end of the LOCKED current cue
    // Never advance to the next subtitle line while the user is hovering a word on the current line!
    if (checkHoverHoldEndOfCue() || state.pausedByHoverAtCueEnd) {
      updateKaraokeWordHighlighting();
      return;
    }

    const idx = state.cues.findIndex((c) => currentMs >= c.startMs && currentMs <= c.endMs);

    if (idx !== -1 && idx !== state.activeCueIndex) {
      if (state.isHoveringSubtitleWord && state.hoverLockedCueIndex !== -1 && idx > state.hoverLockedCueIndex) {
        const lockedCue = state.cues[state.hoverLockedCueIndex];
        if (lockedCue) {
          state.pausedByHoverAtCueEnd = true;
          videoEl.pause();
          videoEl.currentTime = Math.max(lockedCue.startMs / 1000, (lockedCue.endMs - 120) / 1000);
          return;
        }
      }
      state.activeCueIndex = idx;
      state.cueRevealedStep = 0;
      state.selectedRangeStartIdx = -1;
      state.selectedRangeEndIdx = -1;
      renderSubtitleOverlay();
      highlightActiveCueInDock();
      ensureCueTranslated(idx);
      if (idx + 1 < state.cues.length) ensureCueTranslated(idx + 1);
    } else if (idx === -1 && state.activeCueIndex !== -1) {
      // If playback moved past the active cue and we're in a gap > 350ms, hide the subtitle box cleanly
      const prevCue = state.cues[state.activeCueIndex];
      if (!prevCue || currentMs < prevCue.startMs || currentMs > prevCue.endMs + 300) {
        state.activeCueIndex = -1;
        renderSubtitleOverlay();
      }
    }

    updateKaraokeWordHighlighting();

    // 2. Auto-Pause at the end of the active cue if AP is enabled
    if (state.settings.autoPausePerCue && state.activeCueIndex !== -1) {
      const activeCue = state.cues[state.activeCueIndex];
      if (
        activeCue &&
        currentMs >= activeCue.endMs - 140 &&
        state.autoPausedOnCueIndex !== state.activeCueIndex &&
        !videoEl.paused
      ) {
        state.autoPausedOnCueIndex = state.activeCueIndex;
        videoEl.pause();
        if (state.settings.hideSubtitlesMode === 'subtitle-then-translation') {
          state.cueRevealedStep = 2;
          renderSubtitleOverlay(true);
        }
      }
    }
  }

  function captureLiveDomCaptionIfNeeded() {
    if (!playerEl || !videoEl || !state.settings.enabled) return;
    if (state.cues.length > 0 && !state.cues._isLiveDomFallback) return;

    const segments = playerEl.querySelectorAll('.ytp-caption-segment');
    if (!segments || segments.length === 0) return;

    const liveText = Array.from(segments)
      .map((s) => (s.textContent || '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!liveText) return;

    const currentMs = Math.max(0, Math.round(videoEl.currentTime * 1000));
    const lastCue = state.cues[state.cues.length - 1];
    if (lastCue && lastCue.text === liveText) {
      lastCue.endMs = Math.max(lastCue.endMs, currentMs + 2500);
      return;
    }

    if (lastCue && lastCue.endMs > currentMs) {
      lastCue.endMs = Math.max(lastCue.startMs + 300, currentMs - 20);
    }

    const rawWords = liveText.split(/\s+/).filter(Boolean);
    const dur = 3200;
    const words = rawWords.map((w, i) => ({
      index: i,
      word: w,
      startMs: currentMs + Math.round((i / Math.max(1, rawWords.length)) * dur),
      endMs: currentMs + Math.round(((i + 1) / Math.max(1, rawWords.length)) * dur)
    }));

    const newCue = {
      id: `dom-${currentMs}-${state.cues.length}`,
      tStartMs: currentMs,
      startMs: currentMs,
      dDurationMs: dur,
      endMs: currentMs + dur,
      text: liveText,
      words,
      translation: ''
    };
    state.cues._isLiveDomFallback = true;
    state.cues.push(newCue);
    state.activeCueIndex = state.cues.length - 1;
    state.cueRevealedStep = 0;
    renderSubtitleOverlay(true);
    renderRightDock();
    ensureCueTranslated(state.activeCueIndex);
  }

  async function ensureCueTranslated(index) {
    const cue = state.cues[index];
    if (!cue || cue.translation || cue._translating) return;
    cue._translating = true;
    try {
      const res = await sendExtMessage({
        type: 'LT_TRANSLATE_SENTENCE',
        text: cue.text,
        sourceLang: state.settings.sourceLang || 'en',
        targetLang: state.settings.translationLang || 'fa'
      });
      if (res && res.ok && res.translation) {
        cue.translation = res.translation;
        if (index === state.activeCueIndex) renderSubtitleOverlay(true);
        updateCueTranslationInDock(index, res.translation);
      }
    } catch (_e) {
      // ignore
    } finally {
      cue._translating = false;
    }
  }

  function getTokenInlineStyle(category, isBlurred) {
    const mode = state.settings.vocabularyHighlighting || 'Disabled';
    const colors = state.settings.wordColors || Constants.DEFAULT_SETTINGS.wordColors;
    const outline = Boolean(state.settings.vocabOutline);

    if (mode === 'Disabled' || category === 'unranked') {
      return isBlurred ? 'filter: blur(6px); opacity: 0.78;' : '';
    }

    const hex = colors[category] || '#ffffff';
    const styles = [];

    if (mode === 'Background' || mode === 'Blur') {
      if (category === 'ignored' && state.settings.wordColorPreset === 'kevin-hunting') {
        styles.push(`background-color: ${hex}; color: #71717a;`);
      } else {
        styles.push(`background-color: ${hex}38; border-bottom: 2px solid ${hex}; color: #ffffff;`);
      }
    } else if (mode === 'Text') {
      styles.push(`color: ${hex}; font-weight: 600;`);
    } else if (mode === 'Underline') {
      styles.push(`border-bottom: 2.5px solid ${hex};`);
    }

    if (outline && category !== 'unranked') {
      styles.push(`box-shadow: inset 0 0 0 1px ${hex}66;`);
    }

    if (isBlurred || mode === 'Blur') {
      styles.push('text-shadow: 0 0 9px rgba(255,255,255,0.92); color: transparent;');
    }

    return styles.join(' ');
  }

  function renderSubtitleOverlay(force = false) {
    if (!isWatchPage() || !ensurePlayerOverlayMounted() || !subtitleBoxEl) return;

    const showControls = state.settings.showSubtitleControls !== false && state.settings.enabled;
    const leftControlsEl = overlayRoot.querySelector('#lt-left-corner-controls');
    if (leftControlsEl) {
      leftControlsEl.classList.toggle('lt-hidden', !showControls);
      if (showControls && !leftControlsEl.dataset.ltBound) {
        leftControlsEl.dataset.ltBound = 'true';
        leftControlsEl.innerHTML = `
          <button type="button" class="lt-corner-pill" data-lt-left="prev" title="Previous Subtitle (A / ←)">‹</button>
          <button type="button" class="lt-corner-pill" data-lt-left="next" title="Next Subtitle (D / →)">›</button>
        `;
        leftControlsEl.querySelectorAll('[data-lt-left]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const act = btn.getAttribute('data-lt-left');
            seekRelativeCue(act === 'prev' ? -1 : 1);
          });
        });
      }
    }

    const cornerEl = overlayRoot.querySelector('#lt-corner-controls');
    if (cornerEl) {
      cornerEl.classList.toggle('lt-hidden', !showControls);
      const apOn = Boolean(state.settings.autoPausePerCue);
      const cornerKey = apOn ? 'ap-on' : 'ap-off';
      if (cornerEl.dataset.ltRenderKey !== cornerKey) {
        cornerEl.dataset.ltRenderKey = cornerKey;
        cornerEl.innerHTML = `
          <button type="button" class="lt-corner-pill ${apOn ? 'is-active' : ''}" data-lt-corner="toggle-ap" title="Auto-Pause after every subtitle (Shortcut: Q)">
            AP
          </button>
          <button type="button" class="lt-corner-pill" data-lt-corner="nudge-pos" title="Cycle Subtitle Vertical Position (or drag ⋮⋮ on left of subtitle)">
            ⬍
          </button>
        `;
        cornerEl.querySelectorAll('[data-lt-corner]').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.getAttribute('data-lt-corner');
            if (action === 'toggle-ap') {
              state.settings = await Database.saveSettings({ autoPausePerCue: !state.settings.autoPausePerCue });
              renderSubtitleOverlay(true);
            } else if (action === 'nudge-pos') {
              const currentBottom = Number(state.settings.subtitlePosition?.bottomPx || 62);
              const nextBottom = currentBottom > 180 ? 32 : currentBottom + 48;
              state.settings = await Database.saveSettings({
                subtitlePosition: { custom: true, xPercent: 50, bottomPx: nextBottom }
              });
              applySubtitleBoxPosition();
            }
          });
        });
      }
    }

    if (!state.settings.enabled) {
      subtitleBoxEl.classList.add('lt-hidden');
      floatingDictEl.classList.add('lt-hidden');
      hoverTooltipEl.classList.add('lt-hidden');
      return;
    }

    subtitleBoxEl.classList.remove('lt-hidden');
    applySubtitleBoxPosition();

    const activeCue = state.cues[state.activeCueIndex];
    if (!activeCue) {
      subtitleBoxEl.classList.add('is-empty');
      subtitleBoxEl.dataset.ltRenderKey = 'empty';
      return;
    }

    subtitleBoxEl.classList.remove('is-empty');

    const s = state.settings;
    const renderSig = [
      state.activeCueIndex,
      activeCue.text,
      activeCue.translation || '',
      state.cueRevealedStep,
      s.hideSubtitlesMode,
      s.showMachineTranslation,
      s.vocabularyHighlighting,
      s.wordColorPreset,
      s.showTagsInText,
      s.subtitleFontScale,
      s.subtitleColor,
      s.subtitleFontFamily,
      s.subtitleBold,
      s.translationFontScale,
      s.translationColor,
      s.translationFontFamily,
      s.translationBold,
      s.subtitleTextStyle,
      s.translationFirst,
      s.wordByWordHighlight,
      state.selectedRangeStartIdx,
      state.selectedRangeEndIdx,
      state.savedCardsMap.size
    ].join('|');

    if (!force && subtitleBoxEl.dataset.ltRenderKey === renderSig) {
      updateKaraokeWordHighlighting();
      return;
    }
    subtitleBoxEl.dataset.ltRenderKey = renderSig;

    const hideMode = s.hideSubtitlesMode || 'show-both';
    const isSubBlurred =
      (hideMode === 'hide-both' && state.cueRevealedStep < 1) ||
      (hideMode === 'subtitle-then-translation' && state.cueRevealedStep < 1);
    const isTransBlurred =
      (hideMode === 'hide-translations' && state.cueRevealedStep < 2) ||
      (hideMode === 'hide-both' && state.cueRevealedStep < 2) ||
      (hideMode === 'subtitle-then-translation' && state.cueRevealedStep < 2);

    const rawWords = activeCue.text.split(/\s+/).filter(Boolean);
    const wordTimings = Array.isArray(activeCue.words) && activeCue.words.length === rawWords.length
      ? activeCue.words
      : rawWords.map((w, idx) => ({
          index: idx,
          word: w,
          startMs: activeCue.startMs + Math.round((idx / Math.max(1, rawWords.length)) * (activeCue.endMs - activeCue.startMs)),
          endMs: activeCue.startMs + Math.round(((idx + 1) / Math.max(1, rawWords.length)) * (activeCue.endMs - activeCue.startMs))
        }));

    const selMin = Math.min(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
    const selMax = Math.max(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
    const hasMultiSel = state.selectedRangeStartIdx !== -1 && state.selectedRangeEndIdx !== -1;

    const tokensHtml = wordTimings
      .map((wt, idx) => {
        const part = wt.word;
        const clean = Constants.normalizeWord(part);
        if (!clean) return escapeHtml(part);
        const saved = state.savedCardsMap.get(clean);
        const cat = Constants.resolveTokenVisualCategory(clean, saved, s);
        const inlineStyle = getTokenInlineStyle(cat, isSubBlurred);
        const isSelected = hasMultiSel && idx >= selMin && idx <= selMax;
        const meta = s.showTagsInText ? Constants.getWordDifficultyMeta(clean) : null;
        const tagHtml = meta && meta.rank > 1000 ? `<sup class="lt-word-inline-tag">${escapeHtml(meta.cefr)}</sup>` : '';
        return `<span class="lt-sub-word lt-cat-${cat} ${isSelected ? 'is-multi-selected' : ''}" data-lt-word="${escapeHtml(clean)}" data-lt-widx="${idx}" data-start-ms="${wt.startMs}" data-end-ms="${wt.endMs}" style="${inlineStyle}">${escapeHtml(part)}${tagHtml}</span>`;
      })
      .join(' ');

    const textEffectClass = `lt-text-style-${s.subtitleTextStyle || 'shadow'}`;
    const enFontSizePx = Math.round((Number(s.subtitleFontSize || 22) * Number(s.subtitleFontScale || 100)) / 100);
    const faFontSizePx = Math.round((Number(s.translationFontSize || 17) * Number(s.translationFontScale || 100)) / 100);

    const enStyle = [
      `font-size:${enFontSizePx}px`,
      `color:${s.subtitleColor || '#ffffff'}`,
      `font-family:'${s.subtitleFontFamily || 'Inter'}', system-ui, sans-serif`,
      `font-weight:${s.subtitleBold ? '700' : '500'}`
    ].join(';');

    const faStyle = [
      `font-size:${faFontSizePx}px`,
      `color:${s.translationColor || '#fde047'}`,
      `font-family:'${s.translationFontFamily || 'Vazirmatn'}', system-ui, sans-serif`,
      `font-weight:${s.translationBold ? '700' : '500'}`
    ].join(';');

    const showMachine = s.showMachineTranslation !== false;
    const translationHtml = showMachine && activeCue.translation
      ? `<div class="lt-sub-translation ${textEffectClass} ${isTransBlurred ? 'is-blurred' : ''}" dir="rtl" style="${faStyle}">
          ${escapeHtml(activeCue.translation)}
        </div>`
      : '';

    subtitleBoxEl.innerHTML = `
      <div class="lt-sub-hover-grip" data-lt-drag-handle="true" title="Drag to move subtitle box (or Alt + Drag anywhere)">⋮⋮</div>
      <div class="lt-sub-lines ${s.translationFirst ? 'is-translation-first' : ''}">
        <div class="lt-sub-primary ${textEffectClass} ${s.wordByWordHighlight ? 'lt-karaoke-active' : ''}" style="${enStyle}">
          ${tokensHtml}
        </div>
        ${translationHtml}
      </div>
    `;

    updateKaraokeWordHighlighting();

    const wordElements = subtitleBoxEl.querySelectorAll('[data-lt-word]');
    wordElements.forEach((wordSpan) => {
      const idx = Number(wordSpan.getAttribute('data-lt-widx'));
      const word = wordSpan.getAttribute('data-lt-word');

      // 1. Mouse Hover -> Show Language Reactor Teal Mini-Popup + Collocation Detection
      wordSpan.addEventListener('mouseenter', () => {
        if (state.isSelectingWordsDrag && state.dragSelectAnchorIdx !== -1) {
          state.selectedRangeStartIdx = Math.min(state.dragSelectAnchorIdx, idx);
          state.selectedRangeEndIdx = Math.max(state.dragSelectAnchorIdx, idx);
          highlightMultiSelectedWords();
          return;
        }
        if (s.showMiniDictionary !== false) {
          showHoverMiniTooltipForWord(word, idx, rawWords, wordSpan);
        }
      });

      wordSpan.addEventListener('mouseleave', () => {
        if (!state.isSelectingWordsDrag) {
          scheduleHideHoverTooltip();
        }
      });

      // 2. Mousedown -> Support Drag Selection across multiple words for Phrasal Verbs / Idioms
      wordSpan.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.altKey) return;
        e.stopPropagation();
        if (e.shiftKey && state.selectedRangeStartIdx !== -1) {
          state.selectedRangeEndIdx = idx;
          highlightMultiSelectedWords();
          openMultiWordRangeDictionary(
            Math.min(state.selectedRangeStartIdx, idx),
            Math.max(state.selectedRangeStartIdx, idx)
          );
          return;
        }
        state.isSelectingWordsDrag = true;
        state.dragSelectAnchorIdx = idx;
        state.selectedRangeStartIdx = idx;
        state.selectedRangeEndIdx = idx;
      });

      // 3. Click -> Open Right-Side Full Dictionary Drawer
      wordSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (
          state.selectedRangeStartIdx !== -1 &&
          state.selectedRangeEndIdx !== -1 &&
          state.selectedRangeEndIdx !== state.selectedRangeStartIdx
        ) {
          return;
        }
        openWordDictionaryPopup(word, activeCue.text, idx, idx);
      });

      // 4. Right-Click -> Toggle Known / Learning status (matching LR video 01:15)
      wordSpan.addEventListener('contextmenu', async (e) => {
        if (s.rightClickAction === 'none') return;
        e.preventDefault();
        e.stopPropagation();
        const existing = state.savedCardsMap.get(word);
        const nextStatus = existing && existing.status === 'learning' ? 'known' : 'learning';
        const quickRes = await sendExtMessage({
          type: 'LT_QUICK_HOVER_LOOKUP',
          word,
          phrase: '',
          sourceLang: s.sourceLang || 'en',
          targetLang: s.translationLang || 'fa'
        });
        const fa = quickRes?.data?.wordMeanings?.[0] || word;
        await saveWordWithStatus({ word, translation: fa, pos: 'word' }, nextStatus);
      });
    });
  }

  function highlightMultiSelectedWords() {
    if (!subtitleBoxEl) return;
    const minIdx = Math.min(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
    const maxIdx = Math.max(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
    subtitleBoxEl.querySelectorAll('[data-lt-widx]').forEach((el) => {
      const i = Number(el.getAttribute('data-lt-widx'));
      el.classList.toggle('is-multi-selected', i >= minIdx && i <= maxIdx);
    });
  }

  /**
   * Renders the Language Reactor Teal Hover Mini-Popup (`#1b6b85`) directly above the hovered word
   * with Automatic Collocation/Phrasal Verb Detection (e.g. `most people`, `going through`, `24 hours`, `It is not`)
   */
  async function showHoverMiniTooltipForWord(cleanWord, wordIdx, rawWords, anchorSpan) {
    if (!hoverTooltipEl || !playerEl || !anchorSpan) return;
    if (state.hoverHideTimer) {
      clearTimeout(state.hoverHideTimer);
      state.hoverHideTimer = null;
    }

    state.isHoveringSubtitleWord = true;
    state.hoveredWordIndex = wordIdx;
    if (state.hoverLockedCueIndex === -1 && state.activeCueIndex !== -1) {
      state.hoverLockedCueIndex = state.activeCueIndex;
    }

    // Detect if this word is part of a phrasal verb or collocation
    const collocation = Constants.detectCollocationAtWord(rawWords, wordIdx);

    if (subtitleBoxEl) {
      subtitleBoxEl.querySelectorAll('.is-hovered-collocation').forEach((el) => {
        el.classList.remove('is-hovered-collocation');
      });
      if (collocation) {
        for (let i = collocation.startIdx; i <= collocation.endIdx; i++) {
          const span = subtitleBoxEl.querySelector(`[data-lt-widx="${i}"]`);
          if (span) span.classList.add('is-hovered-collocation');
        }
      }
    }

    const playerRect = playerEl.getBoundingClientRect();
    const wordRect = anchorSpan.getBoundingClientRect();
    const centerX = Math.max(90, Math.min(playerRect.width - 90, wordRect.left - playerRect.left + wordRect.width / 2));
    const bottomOffset = Math.max(76, playerRect.bottom - wordRect.top + 8);

    hoverTooltipEl.style.left = `${centerX}px`;
    hoverTooltipEl.style.bottom = `${bottomOffset}px`;
    hoverTooltipEl.classList.remove('lt-hidden');

    // Immediately render the newly hovered word + instant local multi-POS meanings (0ms lag, never stuck on previous word!)
    const savedCard = state.savedCardsMap.get(cleanWord);
    const instantLocal = Constants && typeof Constants.lookupInstantLocalMultiPos === 'function'
      ? Constants.lookupInstantLocalMultiPos(cleanWord)
      : null;
    const instantMeanings = savedCard && savedCard.translation
      ? savedCard.translation.split('،').map((s) => s.trim()).filter(Boolean)
      : (instantLocal && instantLocal.wordMeanings) || [];

    const renderTooltipDom = (meaningsList, phraseFaText) => {
      const phraseBlockHtml = collocation && phraseFaText
        ? `
          <div class="lt-hover-phrase-box">
            <div class="lt-hover-phrase-en">
              <span>${escapeHtml(collocation.phrase)}</span>
              <button type="button" class="lt-hover-save-phrase-btn" id="lt-hover-save-phrase" title="Save Phrasal Verb / Collocation to Flashcards">+ Save</button>
            </div>
            <div class="lt-hover-phrase-fa" dir="rtl">${escapeHtml(phraseFaText)}</div>
          </div>
        `
        : '';

      hoverTooltipEl.innerHTML = `
        ${phraseBlockHtml}
        <div class="lt-hover-word-en">${escapeHtml(cleanWord)}</div>
        <div class="lt-hover-word-meanings" dir="rtl">
          ${meaningsList.map((m) => `<div class="lt-hover-word-meaning-line">${escapeHtml(m)}</div>`).join('')}
        </div>
      `;

      if (collocation && phraseFaText) {
        hoverTooltipEl.querySelector('#lt-hover-save-phrase')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const activeCue = state.cues[state.activeCueIndex];
          await saveWordWithStatus(
            {
              word: collocation.cleanPhrase,
              translation: phraseFaText,
              pos: collocation.pos || 'phrasal verb',
              contextSentence: activeCue ? activeCue.text : '',
              contextTranslation: activeCue ? activeCue.translation : ''
            },
            'learning'
          );
          const btn = hoverTooltipEl.querySelector('#lt-hover-save-phrase');
          if (btn) btn.textContent = '✓ Saved';
        });
      }
    };

    renderTooltipDom(
      instantMeanings.length > 0 ? instantMeanings.slice(0, 4) : ['...'],
      (collocation && collocation.translationFa) || ''
    );

    const res = await sendExtMessage({
      type: 'LT_QUICK_HOVER_LOOKUP',
      word: cleanWord,
      phrase: collocation ? collocation.phrase : '',
      sourceLang: state.settings.sourceLang || 'en',
      targetLang: state.settings.translationLang || 'fa'
    });

    if (!state.isHoveringSubtitleWord || state.hoveredWordIndex !== wordIdx) return;

    const data = (res && res.data) || { word: cleanWord, wordMeanings: instantMeanings.length ? instantMeanings : [cleanWord], phrase: '', phraseMeanings: [] };
    const phraseFa = (collocation && collocation.translationFa) || (data.phraseMeanings && data.phraseMeanings[0]) || '';
    const wordMeanings = Array.isArray(data.wordMeanings) && data.wordMeanings.length > 0
      ? data.wordMeanings.slice(0, 5)
      : (instantMeanings.length ? instantMeanings : [cleanWord]);

    renderTooltipDom(wordMeanings, phraseFa);
  }

  function openMultiWordRangeDictionary(startIdx, endIdx) {
    const activeCue = state.cues[state.activeCueIndex];
    if (!activeCue) return;
    const rawWords = activeCue.text.split(/\s+/).filter(Boolean);
    const selectedTokens = rawWords
      .slice(startIdx, endIdx + 1)
      .map((w) => w.replace(/^[.,!?;:"']+|[.,!?;:"']+$/g, ''))
      .filter(Boolean);
    if (!selectedTokens.length) return;
    const phraseText = selectedTokens.join(' ');
    openWordDictionaryPopup(phraseText, activeCue.text, startIdx, endIdx);
  }

  async function openWordDictionaryPopup(rawWordOrPhrase, contextSentence, startIdx = -1, endIdx = -1) {
    const clean = String(rawWordOrPhrase || '')
      .toLowerCase()
      .replace(/^[^a-zA-Z0-9\u00C0-\u024F']+|[^a-zA-Z0-9\u00C0-\u024F']+$/g, '')
      .trim();
    if (!clean || !floatingDictEl || !playerEl) return;

    state.selectedRangeStartIdx = startIdx;
    state.selectedRangeEndIdx = endIdx;
    state.pausedByHoverAtCueEnd = false;
    state.hoverLockedCueIndex = -1;
    state.dictEditBackOpen = false;
    state.dictAiResult = null;
    state.dictAiLoading = false;
    if (hoverTooltipEl) hoverTooltipEl.classList.add('lt-hidden');

    if (videoEl && !videoEl.paused) videoEl.pause();
    if (state.settings.autoSpeakOnClick) speakText(clean, 'en-US');

    floatingDictEl.classList.remove('lt-hidden');

    // Render instant 0ms local multi-POS entry first so user never sees a blank loading screen
    const instantLocal = Constants && typeof Constants.lookupInstantLocalMultiPos === 'function'
      ? Constants.lookupInstantLocalMultiPos(clean)
      : null;
    const diffMeta = Constants ? Constants.getWordDifficultyMeta(clean) : { cefr: 'B1', freqTag: 'tag 2k', rank: 1800 };
    const savedExisting = state.savedCardsMap.get(clean);

    const initialData = {
      word: clean,
      lemma: (instantLocal && instantLocal.lemma) || clean,
      translation: (savedExisting && savedExisting.translation) || (instantLocal && instantLocal.translation) || clean,
      pos: (instantLocal && instantLocal.pos) || 'word',
      posGroups: (instantLocal && instantLocal.posGroups) || [],
      phonetic: (savedExisting && savedExisting.phonetic) || `/${clean}/`,
      contextSentence: contextSentence || '',
      contextTranslation: '',
      cefr: diffMeta.cefr,
      freqTag: diffMeta.freqTag,
      rank: diffMeta.rank,
      aiExplanation: savedExisting ? savedExisting.aiExplanation : '',
      externalDictionaries: [
        { code: 'AB', name: 'Abadis (آبادیس)', url: `https://abadis.ir/entofa/${encodeURIComponent(clean)}/` },
        { code: 'FA', name: 'FastDic (فست‌دیک)', url: `https://fastdic.com/word/${encodeURIComponent(clean)}` },
        { code: 'Re', name: 'Reverso Context', url: `https://context.reverso.net/translation/english-persian/${encodeURIComponent(clean)}` },
        { code: 'Ca', name: 'Cambridge Dictionary', url: `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(clean)}` },
        { code: 'Wr', name: 'WordReference', url: `https://www.wordreference.com/enfa/${encodeURIComponent(clean)}` },
        { code: 'Gl', name: 'Glosbe EN-FA', url: `https://glosbe.com/en/fa/${encodeURIComponent(clean)}` }
      ]
    };
    state.selectedWordInfo = initialData;
    renderFloatingDictionaryContent(initialData);

    const res = await sendExtMessage({
      type: 'LT_LOOKUP_WORD',
      word: clean,
      contextSentence: contextSentence || '',
      sourceLang: state.settings.sourceLang || 'en',
      targetLang: state.settings.translationLang || 'fa'
    });

    if (!res || !res.ok || !res.data) return;
    if (state.selectedWordInfo && state.selectedWordInfo.word === clean) {
      state.selectedWordInfo = res.data;
      renderFloatingDictionaryContent(res.data);
    }
  }

  function findCurrentVideoExamples(targetWordOrPhrase) {
    const cleanTarget = String(targetWordOrPhrase || '').toLowerCase().trim();
    if (!cleanTarget || !state.cues.length) return [];
    const matches = [];
    for (let i = 0; i < state.cues.length; i++) {
      const c = state.cues[i];
      if (c && c.text && c.text.toLowerCase().includes(cleanTarget)) {
        matches.push({ index: i, text: c.text, translation: c.translation || '', startMs: c.startMs });
        if (matches.length >= 6) break;
      }
    }
    return matches;
  }

  function renderFloatingDictionaryContent(info) {
    if (!floatingDictEl || !info) return;
    const saved = state.savedCardsMap.get(info.word);
    const currentStatus = saved ? saved.status : 'none';
    const isMultiWord = info.word.includes(' ');
    const displayTranslation = (saved && saved.translation) || info.translation || '';
    const displayCustomNotes = (saved && saved.customNotes) || '';

    const posGroupsHtml = Array.isArray(info.posGroups) && info.posGroups.length
      ? info.posGroups
          .slice(0, 4)
          .map(
            (g) => `
          <div class="lt-dict-pos-block">
            <span class="lt-dict-pos-tag">${escapeHtml(g.pos)}</span>
            <span class="lt-dict-pos-terms" dir="rtl">${escapeHtml((g.terms || []).slice(0, 7).join('، '))}</span>
          </div>`
          )
          .join('')
      : `<div class="lt-dict-pos-block">
          <span class="lt-dict-pos-tag">${escapeHtml(isMultiWord ? 'phrasal verb / idiom' : info.pos || 'word')}</span>
          <span class="lt-dict-pos-terms" dir="rtl">${escapeHtml(displayTranslation)}</span>
        </div>`;

    const inVideoExamples = findCurrentVideoExamples(info.word);
    const currentTextHtml = inVideoExamples.length
      ? inVideoExamples
          .map(
            (ex) => `
          <div class="lt-dict-example-item" data-lt-seek-ex="${ex.index}" style="cursor:pointer;">
            <div class="lt-dict-ex-en"><span style="color:#6ee7b7;font-size:10px;margin-right:4px;">▶</span>${escapeHtml(ex.text)}</div>
            ${ex.translation ? `<div class="lt-dict-ex-fa" dir="rtl">${escapeHtml(ex.translation)}</div>` : ''}
          </div>`
          )
          .join('')
      : info.contextSentence
        ? `<div class="lt-dict-example-item">
            <div class="lt-dict-ex-en">${escapeHtml(info.contextSentence)}</div>
            ${info.contextTranslation ? `<div class="lt-dict-ex-fa" dir="rtl">${escapeHtml(info.contextTranslation)}</div>` : ''}
          </div>`
        : '';

    const tatoebaHtml = Array.isArray(info.tatoebaExamples) && info.tatoebaExamples.length
      ? info.tatoebaExamples
          .slice(0, 4)
          .map(
            (ex) => `
          <div class="lt-dict-example-item">
            <div class="lt-dict-ex-en">${escapeHtml(ex.en)}</div>
            ${ex.fa ? `<div class="lt-dict-ex-fa" dir="rtl">${escapeHtml(ex.fa)}</div>` : ''}
          </div>`
          )
          .join('')
      : '';

    const extLinksHtml = (info.externalDictionaries || [])
      .map(
        (d) =>
          `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer" class="lt-ext-dict-pill" title="${escapeHtml(d.name)}">${escapeHtml(d.code)}</a>`
      )
      .join('');

    const activeCue = state.cues[state.activeCueIndex];
    const totalWordsInCue = activeCue ? activeCue.text.split(/\s+/).filter(Boolean).length : 0;
    const canExpandRange = state.selectedRangeStartIdx !== -1 && totalWordsInCue > 1;
    const aiRes = state.dictAiResult;

    floatingDictEl.innerHTML = `
      <div class="lt-dict-card">
        <!-- 1. Top Status Bar (1:1 Website Parity) -->
        <div class="lt-dict-status-strip">
          <button type="button" class="lt-status-btn is-known ${currentStatus === 'known' ? 'active' : ''}" data-lt-set-status="known" title="Mark as Known (Green)">✓ Known</button>
          <button type="button" class="lt-status-btn is-learning ${currentStatus === 'learning' ? 'active' : ''}" data-lt-set-status="learning" title="Save to Anki Flashcards (Orange)">📖 Add to Anki</button>
          <button type="button" class="lt-status-btn ${state.dictEditBackOpen ? 'is-edit-open' : ''}" id="lt-toggle-edit-back-btn" title="ویرایش معنی و پشت فلش‌کارت Anki">✏️ ویرایش پشت کارت</button>
          <span class="lt-dict-cefr-badge">${escapeHtml(info.cefr || 'B1')} • ${escapeHtml(info.freqTag || 'tag 2k')}</span>
          <button type="button" class="lt-dict-close" id="lt-dict-close-btn" title="Close Dictionary">✕</button>
        </div>

        <!-- 2. Multi-Word Range Expander Bar -->
        ${
          canExpandRange
            ? `
          <div class="lt-phrase-expander-bar">
            <span dir="rtl" style="color:#c4b5fd;font-weight:700;">انتخاب چندکلمه‌ای (Phrasal Verb / Idiom):</span>
            <div style="display:flex;gap:5px;">
              <button type="button" class="lt-phrase-exp-btn" id="lt-exp-left" title="Include previous word in phrase">◀ +Word</button>
              <button type="button" class="lt-phrase-exp-btn" id="lt-exp-right" title="Include next word in phrase">+Word ▶</button>
            </div>
          </div>`
            : ''
        }

        <!-- 3. Teal Word + Pronunciation + Primary Persian Header (#0b5772) -->
        <div class="lt-dict-teal-header">
          <div class="lt-dict-teal-left">
            <button type="button" class="lt-dict-audio-btn" id="lt-dict-speak-btn" title="Listen Pronunciation">🔊</button>
            <div>
              <div class="lt-dict-word">${escapeHtml(info.word)}</div>
              <div class="lt-dict-phonetic">${escapeHtml(info.phonetic || `/${info.word}/`)}</div>
            </div>
          </div>
          <div class="lt-dict-teal-right" dir="rtl">
            <div class="lt-dict-primary-fa">${escapeHtml(displayTranslation)}</div>
            ${displayCustomNotes ? `<div class="lt-dict-custom-note-pill">📝 ${escapeHtml(displayCustomNotes)}</div>` : ''}
          </div>
        </div>

        <div class="lt-dict-body">
          <!-- 4. Collapsible Back-of-Card Customizer -->
          ${
            state.dictEditBackOpen
              ? `
            <div class="lt-dict-edit-back-box" dir="rtl">
              <div class="lt-dict-edit-back-title">✏️ شخصی‌سازی معنی و یادداشت پشت کارت Anki</div>
              <div style="margin-bottom:6px;">
                <label class="lt-dict-edit-label">معنی اصلی پشت کارت (فارسی):</label>
                <input type="text" id="lt-custom-fa-input" dir="rtl" value="${escapeHtml(displayTranslation)}" placeholder="معنی فارسی دلخواه..." class="lt-dict-edit-input" />
              </div>
              <div style="margin-bottom:8px;">
                <label class="lt-dict-edit-label">یادداشت شخصی / نکته دستوری پشت کارت:</label>
                <textarea id="lt-custom-notes-input" dir="rtl" rows="2" placeholder="هر توضیح، مترادف یا نکته‌ای که می‌خواهید پشت کارت ببینید..." class="lt-dict-edit-textarea">${escapeHtml(displayCustomNotes)}</textarea>
              </div>
              <button type="button" id="lt-save-custom-back-btn" class="lt-dict-save-back-btn">💾 ذخیره در پشت کارت Anki</button>
            </div>`
              : ''
          }

          <!-- 5. ALL MEANINGS BY PART OF SPEECH (معانی کامل) -->
          <div class="lt-dict-pos-card">
            <div class="lt-dict-pos-card-header">ALL MEANINGS BY PART OF SPEECH (معانی کامل):</div>
            ${posGroupsHtml}
          </div>

          <!-- 6. Lexa AI (Gemini) — معنی دقیق در این جمله -->
          <div class="lt-dict-ai-card">
            <div class="lt-dict-ai-header">
              <span class="lt-dict-ai-title">✨ Lexa AI (Gemini) — معنی دقیق در این جمله</span>
              <button type="button" class="lt-dict-ai-trigger-btn" id="lt-ask-ai-btn" ${state.dictAiLoading ? 'disabled' : ''}>
                ${state.dictAiLoading ? 'در حال تحلیل...' : '✨ تحلیل هوشمند در این جمله'}
              </button>
            </div>

            ${
              aiRes
                ? `
              <div class="lt-dict-ai-result" dir="rtl">
                <div class="lt-dict-ai-highlight-box">
                  <div class="lt-dict-ai-hl-label">🎯 معنی دقیق در این دیالوگ (${escapeHtml(aiRes.contextualPos || info.pos || 'در بافت جمله')}):</div>
                  <div class="lt-dict-ai-hl-value">${escapeHtml(aiRes.contextualMeaningFa || displayTranslation)}</div>
                </div>
                ${
                  aiRes.sentenceTranslationFa
                    ? `<div class="lt-dict-ai-sentence-fa">📝 ترجمه روان کل دیالوگ: «${escapeHtml(aiRes.sentenceTranslationFa)}»</div>`
                    : ''
                }
                <div class="lt-dict-ai-nuance">${escapeHtml(aiRes.explanationFa || info.aiExplanation || '')}</div>
                ${
                  Array.isArray(aiRes.allMeaningsFa) && aiRes.allMeaningsFa.length
                    ? `<div class="lt-dict-ai-all-pos">
                        <div style="font-size:10px;color:#cbd5e1;font-weight:700;margin-bottom:3px;">سایر معانی پرکاربرد:</div>
                        ${aiRes.allMeaningsFa
                          .slice(0, 4)
                          .map(
                            (m) => `
                          <div style="font-size:11px;line-height:1.45;">
                            <span style="color:#6ee7b7;font-family:monospace;margin-left:4px;">[${escapeHtml(m.pos)}]</span>
                            <span style="color:#f4f4f5;">${escapeHtml((m.meaningsFa || []).join('، '))}</span>
                          </div>`
                          )
                          .join('')}
                      </div>`
                    : ''
                }
                <button type="button" class="lt-dict-ai-save-anki-btn" id="lt-save-ai-anki-btn">
                  💾 افزودن معنی هوشمند Gemini به پشت فلش‌کارت Anki
                </button>
              </div>`
                : info.aiExplanation
                  ? `<div class="lt-dict-ai-Subtle" dir="rtl">${escapeHtml(info.aiExplanation)}</div>`
                  : `<div class="lt-dict-ai-placeholder" dir="rtl">برای دریافت معنی دقیق این کلمه یا اصطلاح در بافت همین دیالوگ ویدیو، روی دکمه بالا کلیک کنید.</div>`
            }
          </div>

          <!-- 7. Examples: Current text -->
          ${
            currentTextHtml
              ? `<div class="lt-dict-section-title">EXAMPLES: CURRENT TEXT</div>
                 ${currentTextHtml}`
              : ''
          }

          <!-- 8. Examples: Tatoeba -->
          ${
            tatoebaHtml
              ? `<div class="lt-dict-section-title">EXAMPLES: TATOEBA</div>
                 ${tatoebaHtml}`
              : ''
          }

          <!-- 9. External Dictionaries -->
          <div class="lt-dict-ext-footer">
            <span class="lt-dict-ext-label">External Dictionaries:</span>
            <div class="lt-ext-dict-list">${extLinksHtml}</div>
          </div>
        </div>
      </div>
    `;

    floatingDictEl.querySelector('#lt-dict-close-btn')?.addEventListener('click', () => {
      floatingDictEl.classList.add('lt-hidden');
    });

    floatingDictEl.querySelector('#lt-dict-speak-btn')?.addEventListener('click', () => {
      speakText(info.word, 'en-US');
    });

    floatingDictEl.querySelector('#lt-toggle-edit-back-btn')?.addEventListener('click', () => {
      state.dictEditBackOpen = !state.dictEditBackOpen;
      renderFloatingDictionaryContent(info);
    });

    floatingDictEl.querySelector('#lt-save-custom-back-btn')?.addEventListener('click', async () => {
      const customFa = floatingDictEl.querySelector('#lt-custom-fa-input')?.value?.trim() || displayTranslation;
      const customNotes = floatingDictEl.querySelector('#lt-custom-notes-input')?.value?.trim() || '';
      info.translation = customFa;
      await saveWordWithStatus(Object.assign({}, info, { translation: customFa, customNotes }), saved ? saved.status : 'learning');
      await sendExtMessage({
        type: 'LT_UPDATE_CARD_BACK',
        id: info.word,
        patch: { translation: customFa, customNotes }
      });
      state.dictEditBackOpen = false;
      renderFloatingDictionaryContent(info);
    });

    floatingDictEl.querySelector('#lt-ask-ai-btn')?.addEventListener('click', async () => {
      if (state.dictAiLoading) return;
      state.dictAiLoading = true;
      renderFloatingDictionaryContent(info);
      const activeSentence = info.contextSentence || (state.cues[state.activeCueIndex] ? state.cues[state.activeCueIndex].text : '');
      const aiResp = await sendExtMessage({
        type: 'LT_AI_CONTEXTUAL_EXPLAIN',
        word: info.word,
        contextSentence: activeSentence
      });
      state.dictAiLoading = false;
      if (aiResp && aiResp.ok && aiResp.data) {
        state.dictAiResult = aiResp.data;
        info.aiExplanation = aiResp.data.explanationFa || info.aiExplanation;
      }
      renderFloatingDictionaryContent(info);
    });

    floatingDictEl.querySelector('#lt-save-ai-anki-btn')?.addEventListener('click', async () => {
      if (!state.dictAiResult) return;
      const aiMeaning = state.dictAiResult.contextualMeaningFa || displayTranslation;
      const aiNote = state.dictAiResult.explanationFa || '';
      info.translation = aiMeaning;
      info.aiExplanation = aiNote;
      await saveWordWithStatus(
        Object.assign({}, info, {
          translation: aiMeaning,
          customNotes: aiNote,
          aiExplanation: aiNote
        }),
        'learning'
      );
      await sendExtMessage({
        type: 'LT_UPDATE_CARD_BACK',
        id: info.word,
        patch: {
          translation: aiMeaning,
          customNotes: aiNote,
          aiExplanation: aiNote
        }
      });
      renderFloatingDictionaryContent(info);
    });

    floatingDictEl.querySelector('#lt-exp-left')?.addEventListener('click', () => {
      if (state.selectedRangeStartIdx > 0) {
        state.selectedRangeStartIdx -= 1;
        highlightMultiSelectedWords();
        openMultiWordRangeDictionary(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
      }
    });

    floatingDictEl.querySelector('#lt-exp-right')?.addEventListener('click', () => {
      if (state.selectedRangeEndIdx < totalWordsInCue - 1) {
        state.selectedRangeEndIdx += 1;
        highlightMultiSelectedWords();
        openMultiWordRangeDictionary(state.selectedRangeStartIdx, state.selectedRangeEndIdx);
      }
    });

    floatingDictEl.querySelectorAll('[data-lt-seek-ex]').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = Number(item.getAttribute('data-lt-seek-ex'));
        if (state.cues[idx] && videoEl) {
          state.activeCueIndex = idx;
          videoEl.currentTime = state.cues[idx].startMs / 1000;
          renderSubtitleOverlay(true);
        }
      });
    });

    floatingDictEl.querySelectorAll('[data-lt-set-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nextStatus = btn.getAttribute('data-lt-set-status');
        const customFa = floatingDictEl.querySelector('#lt-custom-fa-input')?.value?.trim() || info.translation;
        const customNotes = floatingDictEl.querySelector('#lt-custom-notes-input')?.value?.trim() || displayCustomNotes;
        await saveWordWithStatus(Object.assign({}, info, { translation: customFa, customNotes }), nextStatus);
        renderFloatingDictionaryContent(info);
      });
    });
  }

  async function saveWordWithStatus(info, status) {
    const activeCue = state.cues[state.activeCueIndex];
    const cleanWord = String(info.word || '').trim().toLowerCase();
    const cardPayload = {
      id: cleanWord,
      word: cleanWord,
      lemma: info.lemma || cleanWord,
      type: cleanWord.includes(' ') ? 'phrase' : 'word',
      translation: info.translation || '',
      pos: info.pos || (cleanWord.includes(' ') ? 'phrasal verb' : 'word'),
      phonetic: info.phonetic || '',
      definitions: info.definitions || [],
      synonyms: info.synonyms || [],
      examples: info.examples || [],
      tatoebaExamples: info.tatoebaExamples || [],
      contextSentence: info.contextSentence || (activeCue ? activeCue.text : ''),
      contextTranslation: info.contextTranslation || (activeCue ? activeCue.translation : ''),
      aiExplanation: info.aiExplanation || '',
      videoId: state.videoId,
      videoTitle: state.videoTitle || document.title.replace(/ - YouTube$/, ''),
      timestamp: activeCue ? Math.floor(activeCue.startMs / 1000) : 0,
      cefr: info.cefr || 'B1',
      freqTag: info.freqTag || 'tag 2k',
      rank: info.rank || 1800,
      status,
      leitnerBox: status === 'known' ? 5 : status === 'ignored' ? 0 : 1
    };

    const res = await sendExtMessage({
      type: 'LT_SAVE_CARD',
      card: cardPayload
    });
    if (res && res.ok && res.card) {
      state.savedCardsMap.set(Constants.normalizeWord(res.card.id), res.card);
      renderSubtitleOverlay(true);
      renderRightDock();
    }
  }

  async function saveActiveCueSentence() {
    const activeCue = state.cues[state.activeCueIndex];
    if (!activeCue) return;
    if (!activeCue.translation) {
      await ensureCueTranslated(state.activeCueIndex);
    }
    const res = await sendExtMessage({
      type: 'LT_SAVE_SENTENCE',
      sentence: {
        text: activeCue.text,
        translation: activeCue.translation || '',
        videoId: state.videoId,
        videoTitle: state.videoTitle || document.title.replace(/ - YouTube$/, ''),
        timestamp: Math.floor(activeCue.startMs / 1000)
      }
    });
    if (res && res.ok && res.sentence) {
      state.savedSentences.unshift(res.sentence);
      renderRightDock();
    }
  }

  function seekRelativeCue(offset, reblur = false) {
    if (!videoEl || !state.cues.length) return;
    const baseIdx = state.activeCueIndex === -1 ? 0 : state.activeCueIndex;
    const targetIdx = Math.max(0, Math.min(state.cues.length - 1, baseIdx + offset));
    const cue = state.cues[targetIdx];
    if (!cue) return;
    state.activeCueIndex = targetIdx;
    state.autoPausedOnCueIndex = -1;
    state.pausedByHoverAtCueEnd = false;
    state.cueRevealedStep = reblur ? 0 : state.cueRevealedStep;
    videoEl.currentTime = cue.startMs / 1000;
    videoEl.play().catch(() => {});
    renderSubtitleOverlay(true);
    highlightActiveCueInDock();
  }

  function bindKeyboardShortcuts() {
    window.addEventListener('keydown', async (e) => {
      if (!isWatchPage() || !state.settings.enabled) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

      state.pressedKeys.add(e.code);

      if ((state.pressedKeys.has('KeyA') && state.pressedKeys.has('KeyD')) || e.code === 'KeyW') {
        e.preventDefault();
        state.cueRevealedStep = 0;
        seekRelativeCue(0, true);
        return;
      }

      const useArrows = state.settings.useArrowKeysForSubtitles !== false;

      if (e.code === 'KeyA' || (useArrows && e.code === 'ArrowLeft')) {
        e.preventDefault();
        seekRelativeCue(-1);
      } else if (e.code === 'KeyS' || (useArrows && e.code === 'ArrowDown')) {
        e.preventDefault();
        seekRelativeCue(0);
      } else if (e.code === 'KeyD' || (useArrows && e.code === 'ArrowRight')) {
        e.preventDefault();
        seekRelativeCue(1);
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        state.cueRevealedStep = state.cueRevealedStep >= 2 ? 0 : state.cueRevealedStep + 1;
        renderSubtitleOverlay(true);
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        state.settings = await Database.saveSettings({ autoPausePerCue: !state.settings.autoPausePerCue });
        renderSubtitleOverlay(true);
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        await saveActiveCueSentence();
      }
    });

    window.addEventListener('keyup', (e) => {
      state.pressedKeys.delete(e.code);
    });
  }

  /**
   * Right-Side 3-Tab Dock (`Subtitles | Words | Saved` + `⚙` + `📤 Export`)
   */
  function ensureRightDockMounted() {
    if (!isWatchPage()) return false;
    const secondary =
      document.querySelector('ytd-watch-flexy #secondary-inner') ||
      document.querySelector('ytd-watch-flexy #secondary') ||
      document.querySelector('#secondary-inner') ||
      document.querySelector('#secondary');
    if (!secondary) return false;
    const existingDock = secondary.querySelector('#lt-right-dock');
    if (!existingDock) {
      dockRoot = document.createElement('div');
      dockRoot.id = 'lt-right-dock';
      dockRoot.className = 'lt-right-dock';
      secondary.insertBefore(dockRoot, secondary.firstChild);
    } else {
      dockRoot = existingDock;
    }
    return true;
  }

  function extractUniqueVideoWords() {
    const map = new Map();
    for (const cue of state.cues) {
      const words = cue.text.split(/\s+/);
      for (const raw of words) {
        const clean = Constants.normalizeWord(raw);
        if (!clean || clean.length < 2) continue;
        if (!map.has(clean)) {
          const saved = state.savedCardsMap.get(clean);
          const meta = Constants.getWordDifficultyMeta(clean);
          const cat = Constants.resolveTokenVisualCategory(clean, saved, state.settings);
          map.set(clean, {
            word: clean,
            count: 1,
            rank: meta.rank,
            cefr: meta.cefr,
            freqTag: meta.freqTag,
            category: cat,
            cueText: cue.text
          });
        } else {
          map.get(clean).count += 1;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.rank - b.rank);
  }

  function renderRightDock() {
    if (!ensureRightDockMounted() || !dockRoot) return;
    if (!state.settings.enabled || state.settings.showSubtitlesListView === false) {
      dockRoot.classList.add('lt-hidden');
      return;
    }
    dockRoot.classList.remove('lt-hidden');

    const totalSavedCount = state.savedCardsMap.size + state.savedSentences.length;

    let bodyHtml = '';
    if (state.activeTab === 'subtitles') {
      bodyHtml = state.cues.length
        ? `<div class="lt-dock-cue-list" id="lt-dock-cue-list">
            ${state.cues
              .map(
                (c, i) => `
              <div class="lt-dock-cue-row ${i === state.activeCueIndex ? 'is-active' : ''}" data-lt-cue-idx="${i}">
                <button type="button" class="lt-cue-play-btn" data-lt-cue-seek="${i}">▶ ${formatTime(c.startMs / 1000)}</button>
                <div class="lt-cue-texts">
                  <div class="lt-cue-en">${escapeHtml(c.text)}</div>
                  ${
                    c.translation
                      ? `<div class="lt-cue-fa" dir="rtl">${escapeHtml(c.translation)}</div>`
                      : `<div class="lt-cue-fa is-muted" dir="rtl" id="lt-dock-trans-${i}">...</div>`
                  }
                </div>
              </div>`
              )
              .join('')}
          </div>`
        : `<div class="lt-dock-empty" style="padding:14px;color:#a1a1aa;font-size:12px;">در انتظار بارگذاری زیرنویس ویدیو...</div>`;
    } else if (state.activeTab === 'words') {
      const allWords = extractUniqueVideoWords();
      const filtered = state.wordFilterCat === 'all'
        ? allWords
        : allWords.filter((w) => w.category === state.wordFilterCat);

      bodyHtml = `
        <div class="lt-words-filter-bar">
          <button type="button" class="lt-wf-btn ${state.wordFilterCat === 'all' ? 'active' : ''}" data-lt-wf="all">All (${allWords.length})</button>
          <button type="button" class="lt-wf-btn ${state.wordFilterCat === 'suggested' ? 'active' : ''}" data-lt-wf="suggested">Suggested</button>
          <button type="button" class="lt-wf-btn ${state.wordFilterCat === 'learning' ? 'active' : ''}" data-lt-wf="learning">Learning</button>
          <button type="button" class="lt-wf-btn ${state.wordFilterCat === 'known' ? 'active' : ''}" data-lt-wf="known">Known</button>
        </div>
        <div class="lt-dock-word-list">
          ${filtered
            .slice(0, 120)
            .map(
              (w) => `
            <div class="lt-dock-word-row" data-lt-word-item="${escapeHtml(w.word)}" data-lt-word-ctx="${escapeHtml(w.cueText)}">
              <span class="lt-word-dot lt-cat-${w.category}"></span>
              <strong class="lt-word-label">${escapeHtml(w.word)}</strong>
              <span class="lt-word-meta">${escapeHtml(w.cefr)} • ${escapeHtml(w.freqTag)}</span>
              <span class="lt-word-count">×${w.count}</span>
            </div>`
            )
            .join('')}
        </div>
      `;
    } else {
      const savedWords = Array.from(state.savedCardsMap.values());
      bodyHtml = `
        <div class="lt-saved-tab-wrap">
          <div class="lt-saved-header-bar">
            <span style="font-size:12px;">${savedWords.length} Items • ${state.savedSentences.length} Sentences</span>
            <button type="button" class="lt-open-portal-btn" id="lt-open-portal-btn">🪭 Flashcards & Portal</button>
          </div>
          <div class="lt-dock-word-list">
            ${
              savedWords.length === 0
                ? `<div class="lt-dock-empty" style="padding:14px;color:#a1a1aa;font-size:12px;">روی هر کلمه یا عبارت چندکلمه‌ای در زیرنویس کلیک یا درگ کنید و 📖 Learn را بزنید.</div>`
                : savedWords
                    .map(
                      (c) => `
                <div class="lt-dock-word-row" data-lt-word-item="${escapeHtml(c.word)}" data-lt-word-ctx="${escapeHtml(c.contextSentence || '')}">
                  <span class="lt-word-dot lt-cat-${c.status || 'learning'}"></span>
                  <strong class="lt-word-label">${escapeHtml(c.word)}</strong>
                  <span class="lt-word-fa" dir="rtl">${escapeHtml(c.translation || '')}</span>
                </div>`
                    )
                    .join('')
            }
          </div>
        </div>
      `;
    }

    dockRoot.innerHTML = `
      <div class="lt-dock-header">
        <div class="lt-dock-tabs">
          <button type="button" class="lt-dock-tab ${state.activeTab === 'subtitles' ? 'active' : ''}" data-lt-tab="subtitles">Subtitles</button>
          <button type="button" class="lt-dock-tab ${state.activeTab === 'words' ? 'active' : ''}" data-lt-tab="words">Words</button>
          <button type="button" class="lt-dock-tab ${state.activeTab === 'saved' ? 'active' : ''}" data-lt-tab="saved">Saved (${totalSavedCount})</button>
        </div>
        <div class="lt-dock-actions">
          <button type="button" class="lt-dock-icon-btn" id="lt-dock-export-btn" title="Export Subtitles (Printable HTML / CSV)">📤</button>
          <button type="button" class="lt-dock-icon-btn" id="lt-dock-settings-btn" title="Settings">⚙</button>
        </div>
      </div>
      <div class="lt-dock-body">${bodyHtml}</div>
    `;

    dockRoot.querySelectorAll('[data-lt-tab]').forEach((tabBtn) => {
      tabBtn.addEventListener('click', async () => {
        state.activeTab = tabBtn.getAttribute('data-lt-tab');
        await Database.saveSettings({ activeRightTab: state.activeTab });
        renderRightDock();
      });
    });

    dockRoot.querySelector('#lt-dock-export-btn')?.addEventListener('click', () => {
      state.exportModalOpen = true;
      renderExportModal();
    });

    dockRoot.querySelector('#lt-dock-settings-btn')?.addEventListener('click', () => {
      state.settingsModalOpen = true;
      renderSettingsModal();
    });

    dockRoot.querySelector('#lt-open-portal-btn')?.addEventListener('click', () => {
      sendExtMessage({ type: 'LT_OPEN_DASHBOARD', tab: 'phrasepump' });
    });

    dockRoot.querySelectorAll('[data-lt-cue-seek]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-lt-cue-seek'));
        if (state.cues[idx] && videoEl) {
          state.activeCueIndex = idx;
          videoEl.currentTime = state.cues[idx].startMs / 1000;
          videoEl.play().catch(() => {});
          renderSubtitleOverlay(true);
          highlightActiveCueInDock();
        }
      });
    });

    dockRoot.querySelectorAll('[data-lt-wf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.wordFilterCat = btn.getAttribute('data-lt-wf');
        renderRightDock();
      });
    });

    dockRoot.querySelectorAll('[data-lt-word-item]').forEach((row) => {
      row.addEventListener('click', () => {
        const w = row.getAttribute('data-lt-word-item');
        const ctx = row.getAttribute('data-lt-word-ctx') || '';
        openWordDictionaryPopup(w, ctx, -1, -1);
      });
    });
  }

  function highlightActiveCueInDock() {
    if (!dockRoot || state.activeTab !== 'subtitles') return;
    dockRoot.querySelectorAll('.lt-dock-cue-row').forEach((row) => {
      const idx = Number(row.getAttribute('data-lt-cue-idx'));
      row.classList.toggle('is-active', idx === state.activeCueIndex);
      if (idx === state.activeCueIndex) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function updateCueTranslationInDock(idx, translation) {
    if (!dockRoot) return;
    const el = dockRoot.querySelector(`#lt-dock-trans-${idx}`);
    if (el) {
      el.textContent = translation;
      el.classList.remove('is-muted');
    }
  }

  function renderExportModal() {
    if (!state.exportModalOpen) {
      if (exportModalEl) exportModalEl.remove();
      exportModalEl = null;
      return;
    }
    if (!exportModalEl) {
      exportModalEl = document.createElement('div');
      exportModalEl.className = 'lt-modal-backdrop';
      document.body.appendChild(exportModalEl);
    }

    exportModalEl.innerHTML = `
      <div class="lt-modal-card" style="width:520px;">
        <div class="lt-modal-header">
          <h3>Export Subtitles & Vocabulary</h3>
          <button type="button" class="lt-dict-close" id="lt-export-close">✕</button>
        </div>
        <div style="padding:18px;">
          <label class="lt-field-row" style="justify-content:flex-start;gap:12px;">
            <input type="radio" name="lt_exp_fmt" value="html" ${state.exportFormat === 'html' ? 'checked' : ''} />
            <div>
              <strong>Print (HTML) — Two-Column Bilingual Study Sheet</strong>
              <p style="font-size:12px;color:#a1a1aa;margin-top:2px;">Clean two-column printable transcript (Original + Persian + Timestamps).</p>
            </div>
          </label>
          <label class="lt-field-row" style="justify-content:flex-start;gap:12px;margin-top:14px;">
            <input type="radio" name="lt_exp_fmt" value="csv" ${state.exportFormat === 'csv' ? 'checked' : ''} />
            <div>
              <strong>Excel (CSV) / Anki Deck</strong>
              <p style="font-size:12px;color:#a1a1aa;margin-top:2px;">Downloads all subtitle cues in UTF-8 CSV format for Excel or Anki.</p>
            </div>
          </label>
        </div>
        <div class="lt-modal-footer">
          <button type="button" class="lt-status-btn" id="lt-export-cancel">Cancel</button>
          <button type="button" class="lt-open-portal-btn" id="lt-export-confirm">Export</button>
        </div>
      </div>
    `;

    exportModalEl.querySelectorAll('input[name="lt_exp_fmt"]').forEach((r) => {
      r.addEventListener('change', () => {
        state.exportFormat = r.value;
      });
    });

    exportModalEl.querySelector('#lt-export-close')?.addEventListener('click', () => {
      state.exportModalOpen = false;
      renderExportModal();
    });
    exportModalEl.querySelector('#lt-export-cancel')?.addEventListener('click', () => {
      state.exportModalOpen = false;
      renderExportModal();
    });
    exportModalEl.querySelector('#lt-export-confirm')?.addEventListener('click', () => {
      executeTranscriptExport(state.exportFormat);
      state.exportModalOpen = false;
      renderExportModal();
    });
  }

  function executeTranscriptExport(format) {
    const title = state.videoTitle || document.title || 'Cunt Academy Study Sheet';
    if (format === 'html') {
      const rowsHtml = state.cues
        .map(
          (c, i) => `
          <tr>
            <td class="num">${i + 1}.</td>
            <td class="time">${formatTime(c.startMs / 1000)}</td>
            <td class="en">${escapeHtml(c.text)}</td>
            <td class="fa" dir="rtl">${escapeHtml(c.translation || '')}</td>
          </tr>`
        )
        .join('');
      const htmlDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — Cunt Academy Printable Transcript</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 32px; color: #18181b; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 10px 12px; border-bottom: 1px solid #e4e4e7; vertical-align: top; font-size: 15px; }
    td.num, td.time { width: 48px; color: #71717a; font-family: monospace; font-size: 13px; }
    td.en { width: 46%; font-weight: 500; }
    td.fa { width: 46%; color: #27272a; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <table><tbody>${rowsHtml}</tbody></table>
</body>
</html>`;
      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cunt-academy-transcript-${state.videoId || 'study'}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } else {
      const csvRows = [
        ['Index', 'Time', 'English Subtitle', 'Persian Translation'].join(','),
        ...state.cues.map((c, i) =>
          [
            i + 1,
            formatTime(c.startMs / 1000),
            `"${String(c.text || '').replace(/"/g, '""')}"`,
            `"${String(c.translation || '').replace(/"/g, '""')}"`
          ].join(',')
        )
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csvRows], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cunt-academy-transcript-${state.videoId || 'study'}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  /**
   * Combined Language Reactor (`language_reactor_49466273.mp4` 01:15-01:32)
   * + Trancy (`word_by_word_trancy_a0703cdc.mp4` 00:24-01:25) Settings & Style Customizer Modal
   */
  function renderSettingsModal() {
    if (!state.settingsModalOpen) {
      if (settingsModalEl) settingsModalEl.remove();
      settingsModalEl = null;
      return;
    }
    if (!settingsModalEl) {
      settingsModalEl = document.createElement('div');
      settingsModalEl.className = 'lt-modal-backdrop';
      document.body.appendChild(settingsModalEl);
    }

    const s = state.settings;
    const colors = s.wordColors || Constants.DEFAULT_SETTINGS.wordColors;

    settingsModalEl.innerHTML = `
      <div class="lt-modal-card">
        <div class="lt-modal-header">
          <strong>Settings — Cunt Academy (Language Reactor + Trancy Engine)</strong>
          <button type="button" class="lt-dict-close" id="lt-settings-close">✕</button>
        </div>

        <div class="lt-settings-layout">
          <!-- Left Sidebar: Brand & Keyboard Shortcuts Reference (matching LR video 01:17) -->
          <div class="lt-settings-sidebar">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
              <div class="lt-ytp-lr-circle" style="width:36px;height:36px;font-size:13px;">CA</div>
              <div>
                <div style="font-size:11px;color:#a1a1aa;">CUNT</div>
                <strong style="font-size:14px;color:#fff;">ACADEMY</strong>
              </div>
            </div>

            <div style="font-weight:700;color:#fff;margin-bottom:8px;">Keyboard shortcuts:</div>
            <div class="lt-shortcut-row"><span>Previous</span><span class="lt-kbd">A / ←</span></div>
            <div class="lt-shortcut-row"><span>Repeat</span><span class="lt-kbd">S / ↓</span></div>
            <div class="lt-shortcut-row"><span>Next</span><span class="lt-kbd">D / →</span></div>
            <div class="lt-shortcut-row"><span>Play / Pause</span><span class="lt-kbd">Space</span></div>
            <div class="lt-shortcut-row"><span>Toggle auto-pause</span><span class="lt-kbd">Q</span></div>
            <div class="lt-shortcut-row"><span>Save current subtitle</span><span class="lt-kbd">R</span></div>
            <div class="lt-shortcut-row"><span>Reveal blurred text</span><span class="lt-kbd">E</span></div>
            <div class="lt-shortcut-row"><span>Dictionary</span><span class="lt-kbd">Left click</span></div>
            <div class="lt-shortcut-row"><span>Mark word</span><span class="lt-kbd">Right click</span></div>
            <div class="lt-shortcut-row"><span>Select phrase</span><span class="lt-kbd">Drag / Shift+Click</span></div>
          </div>

          <!-- Right Main Column: Trancy Subtitle Style + Language Reactor Controls -->
          <div class="lt-settings-main">
            <div class="lt-settings-section-title">1. Trancy Subtitle Appearance & Word-by-Word Karaoke (تنظیمات زیرنویس)</div>

            <div class="lt-field-row">
              <span>Word-by-Word Speaker Highlighting (برجسته‌سازی کلمه به کلمه)</span>
              <input type="checkbox" id="lt-set-wbw" ${s.wordByWordHighlight ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Original Font Size (اندازه فونت اصلی)</span>
              <div class="lt-stepper-group">
                <button type="button" class="lt-stepper-btn" id="lt-en-scale-dec">−</button>
                <span class="lt-stepper-val">${Number(s.subtitleFontScale || 100)}%</span>
                <button type="button" class="lt-stepper-btn" id="lt-en-scale-inc">+</button>
              </div>
            </div>

            <div class="lt-field-row">
              <span>Original Color & Bold (رنگ و ضخامت فونت اصلی)</span>
              <div style="display:flex;align-items:center;gap:10px;">
                <input type="color" id="lt-set-en-color" value="${s.subtitleColor || '#ffffff'}" />
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;">
                  <input type="checkbox" id="lt-set-en-bold" ${s.subtitleBold ? 'checked' : ''} /> Bold
                </label>
              </div>
            </div>

            <div class="lt-field-row">
              <span>Original Font Family (فونت اصلی)</span>
              <select id="lt-set-en-font">
                ${['Inter', 'Rubik', 'Roboto', 'Noto Sans', 'Vollkorn', 'Work Sans', 'Open Sans', 'Merriweather'].map(
                  (f) => `<option value="${f}" ${s.subtitleFontFamily === f ? 'selected' : ''}>${f}</option>`
                ).join('')}
              </select>
            </div>

            <div class="lt-field-row">
              <span>Translation Font Size (اندازه فونت ترجمه)</span>
              <div class="lt-stepper-group">
                <button type="button" class="lt-stepper-btn" id="lt-fa-scale-dec">−</button>
                <span class="lt-stepper-val">${Number(s.translationFontScale || 100)}%</span>
                <button type="button" class="lt-stepper-btn" id="lt-fa-scale-inc">+</button>
              </div>
            </div>

            <div class="lt-field-row">
              <span>Translation Color & Bold (رنگ و ضخامت ترجمه)</span>
              <div style="display:flex;align-items:center;gap:10px;">
                <input type="color" id="lt-set-fa-color" value="${s.translationColor || '#fde047'}" />
                <label style="display:flex;align-items:center;gap:4px;font-size:12px;">
                  <input type="checkbox" id="lt-set-fa-bold" ${s.translationBold ? 'checked' : ''} /> Bold
                </label>
              </div>
            </div>

            <div class="lt-field-row">
              <span>Subtitle background opacity (شفافیت پس‌زمینه)</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="range" id="lt-set-bg-opacity" min="0" max="100" step="5" value="${Number(s.subtitleBgOpacity ?? 75)}" />
                <span style="font-family:monospace;font-size:12px;width:36px;">${Number(s.subtitleBgOpacity ?? 75)}%</span>
              </div>
            </div>

            <div class="lt-field-row">
              <span>Background Blur (تاری پس‌زمینه)</span>
              <input type="checkbox" id="lt-set-bg-blur" ${s.subtitleBgBlur ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Font Effect Style (سبک خط/فونت)</span>
              <select id="lt-set-text-style">
                <option value="shadow" ${s.subtitleTextStyle === 'shadow' ? 'selected' : ''}>shadow (سایه نرم)</option>
                <option value="outline" ${s.subtitleTextStyle === 'outline' ? 'selected' : ''}>outline (حاشیه مشکی)</option>
                <option value="raised" ${s.subtitleTextStyle === 'raised' ? 'selected' : ''}>raised (برجسته سه‌بعدی)</option>
                <option value="netflix" ${s.subtitleTextStyle === 'netflix' ? 'selected' : ''}>netflix (سینمایی نتفلیکس)</option>
                <option value="none" ${s.subtitleTextStyle === 'none' ? 'selected' : ''}>none (ساده)</option>
              </select>
            </div>

            <div class="lt-field-row">
              <span>Translation Priority Above Original (اولویت ترجمه در بالا)</span>
              <input type="checkbox" id="lt-set-trans-first" ${s.translationFirst ? 'checked' : ''} />
            </div>

            <div class="lt-settings-section-title">2. Language Reactor Behavior & Hover Popup</div>

            <div class="lt-field-row">
              <span>Show machine translation</span>
              <input type="checkbox" id="lt-set-show-mt" ${s.showMachineTranslation !== false ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Hide subtitles (Listening Mode)</span>
              <select id="lt-set-hide-mode">
                <option value="show-both" ${s.hideSubtitlesMode === 'show-both' ? 'selected' : ''}>Disabled (Show both)</option>
                <option value="hide-translations" ${s.hideSubtitlesMode === 'hide-translations' ? 'selected' : ''}>Hide translations</option>
                <option value="subtitle-then-translation" ${s.hideSubtitlesMode === 'subtitle-then-translation' ? 'selected' : ''}>Subtitle then translation (Press 'E')</option>
                <option value="hide-both" ${s.hideSubtitlesMode === 'hide-both' ? 'selected' : ''}>Hide both</option>
              </select>
            </div>

            <div class="lt-field-row">
              <span>Show mini dictionary on hover (پاپ‌آپ معنی و تشخیص عبارات با هاور ماوس)</span>
              <input type="checkbox" id="lt-set-mini-dict" ${s.showMiniDictionary !== false ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Auto-pause at end of line while hovering word & auto-resume on leave</span>
              <input type="checkbox" id="lt-set-hover-pause" ${s.hoverPauseAtCueEnd !== false ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Right click action</span>
              <select id="lt-set-rc-action">
                <option value="toggle_known_learning" ${s.rightClickAction !== 'none' ? 'selected' : ''}>Toggle known / learning (recommended)</option>
                <option value="none" ${s.rightClickAction === 'none' ? 'selected' : ''}>Disabled</option>
              </select>
            </div>

            <div class="lt-field-row">
              <span>Show subtitle controls (&lt; &gt; / AP / ⬍)</span>
              <input type="checkbox" id="lt-set-show-ctrls" ${s.showSubtitleControls !== false ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Hide playback bar until mouse at bottom</span>
              <input type="checkbox" id="lt-set-hide-playbar" ${s.hidePlaybackBar ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Show subtitles list view (Right Dock)</span>
              <input type="checkbox" id="lt-set-show-dock" ${s.showSubtitlesListView !== false ? 'checked' : ''} />
            </div>

            <div class="lt-field-row">
              <span>Speak word on click</span>
              <input type="checkbox" id="lt-set-speak-click" ${s.autoSpeakOnClick !== false ? 'checked' : ''} />
            </div>

            <div class="lt-settings-section-title">3. Local Vocabulary Level & Highlighting (بدون نیاز به AI پولی)</div>

            <div class="lt-field-row">
              <span>Vocabulary highlighting</span>
              <select id="lt-set-hl-mode">
                <option value="Disabled" ${s.vocabularyHighlighting === 'Disabled' ? 'selected' : ''}>Disabled (Clean Default)</option>
                <option value="Background" ${s.vocabularyHighlighting === 'Background' ? 'selected' : ''}>Background</option>
                <option value="Text" ${s.vocabularyHighlighting === 'Text' ? 'selected' : ''}>Text</option>
                <option value="Underline" ${s.vocabularyHighlighting === 'Underline' ? 'selected' : ''}>Underline</option>
                <option value="Blur" ${s.vocabularyHighlighting === 'Blur' ? 'selected' : ''}>Blur</option>
              </select>
            </div>

            <div class="lt-field-row">
              <span>Set vocabulary level (Local CEFR Frequency Rank)</span>
              <select id="lt-set-vocab-level">
                <option value="1000" ${Number(s.vocabLevelRank) === 1000 ? 'selected' : ''}>A1 — Beginner (Top 1,000 words known)</option>
                <option value="2000" ${Number(s.vocabLevelRank || 2000) === 2000 ? 'selected' : ''}>A2 — Elementary (Top 2,000 words known)</option>
                <option value="3500" ${Number(s.vocabLevelRank) === 3500 ? 'selected' : ''}>B1 — Intermediate (Top 3,500 words known)</option>
                <option value="5000" ${Number(s.vocabLevelRank) === 5000 ? 'selected' : ''}>B2 — Upper-Intermediate (Top 5,000 words known)</option>
                <option value="7000" ${Number(s.vocabLevelRank) === 7000 ? 'selected' : ''}>C1 — Advanced (Top 7,000 words known)</option>
              </select>
            </div>

            <div class="lt-field-row">
              <span>Show difficulty tags in text (A1..C1)</span>
              <input type="checkbox" id="lt-set-show-tags" ${s.showTagsInText ? 'checked' : ''} />
            </div>

            <div class="lt-color-pickers-row">
              <label><span>Known</span><input type="color" id="lt-col-known" value="${colors.known}" /></label>
              <label><span>Suggested</span><input type="color" id="lt-col-suggested" value="${colors.suggested}" /></label>
              <label><span>Learn</span><input type="color" id="lt-col-learning" value="${colors.learning}" /></label>
              <label><span>Ignore</span><input type="color" id="lt-col-ignored" value="${colors.ignored}" /></label>
            </div>

            <div class="lt-example-preview-box">
              <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">EXAMPLE TEXT:</div>
              <p>
                <span style="color:${colors.known};font-weight:600;">The first night I went to sleep</span>
                on the
                <span style="color:${colors.suggested};font-weight:600;">sand</span>,
                a thousand miles from any
                <span style="color:${colors.learning};font-weight:600;">inhabited</span>
                country.
              </p>
            </div>
          </div>
        </div>

        <div class="lt-modal-footer">
          <button type="button" class="lt-status-btn" id="lt-settings-reset">Reset Defaults</button>
          <button type="button" class="lt-open-portal-btn" id="lt-settings-close-btn">Close</button>
        </div>
      </div>
    `;

    const closeSettings = () => {
      state.settingsModalOpen = false;
      renderSettingsModal();
    };
    settingsModalEl.querySelector('#lt-settings-close')?.addEventListener('click', closeSettings);
    settingsModalEl.querySelector('#lt-settings-close-btn')?.addEventListener('click', closeSettings);

    const saveAndRefresh = async (patch) => {
      state.settings = await Database.saveSettings(patch);
      applyPlaybarAutoHideMode();
      updateYtpControlBarWidget();
      renderSubtitleOverlay(true);
      renderRightDock();
      renderSettingsModal();
    };

    settingsModalEl.querySelector('#lt-settings-reset')?.addEventListener('click', () => {
      saveAndRefresh(Constants.DEFAULT_SETTINGS);
    });

    settingsModalEl.querySelector('#lt-set-wbw')?.addEventListener('change', (e) => saveAndRefresh({ wordByWordHighlight: e.target.checked }));
    settingsModalEl.querySelector('#lt-en-scale-dec')?.addEventListener('click', () => saveAndRefresh({ subtitleFontScale: Math.max(60, Number(s.subtitleFontScale || 100) - 10) }));
    settingsModalEl.querySelector('#lt-en-scale-inc')?.addEventListener('click', () => saveAndRefresh({ subtitleFontScale: Math.min(200, Number(s.subtitleFontScale || 100) + 10) }));
    settingsModalEl.querySelector('#lt-set-en-color')?.addEventListener('input', (e) => saveAndRefresh({ subtitleColor: e.target.value }));
    settingsModalEl.querySelector('#lt-set-en-bold')?.addEventListener('change', (e) => saveAndRefresh({ subtitleBold: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-en-font')?.addEventListener('change', (e) => saveAndRefresh({ subtitleFontFamily: e.target.value }));

    settingsModalEl.querySelector('#lt-fa-scale-dec')?.addEventListener('click', () => saveAndRefresh({ translationFontScale: Math.max(60, Number(s.translationFontScale || 100) - 10) }));
    settingsModalEl.querySelector('#lt-fa-scale-inc')?.addEventListener('click', () => saveAndRefresh({ translationFontScale: Math.min(200, Number(s.translationFontScale || 100) + 10) }));
    settingsModalEl.querySelector('#lt-set-fa-color')?.addEventListener('input', (e) => saveAndRefresh({ translationColor: e.target.value }));
    settingsModalEl.querySelector('#lt-set-fa-bold')?.addEventListener('change', (e) => saveAndRefresh({ translationBold: e.target.checked }));

    settingsModalEl.querySelector('#lt-set-bg-opacity')?.addEventListener('input', (e) => saveAndRefresh({ subtitleBgOpacity: Number(e.target.value) }));
    settingsModalEl.querySelector('#lt-set-bg-blur')?.addEventListener('change', (e) => saveAndRefresh({ subtitleBgBlur: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-text-style')?.addEventListener('change', (e) => saveAndRefresh({ subtitleTextStyle: e.target.value }));
    settingsModalEl.querySelector('#lt-set-trans-first')?.addEventListener('change', (e) => saveAndRefresh({ translationFirst: e.target.checked }));

    settingsModalEl.querySelector('#lt-set-show-mt')?.addEventListener('change', (e) => saveAndRefresh({ showMachineTranslation: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-hide-mode')?.addEventListener('change', (e) => saveAndRefresh({ hideSubtitlesMode: e.target.value }));
    settingsModalEl.querySelector('#lt-set-mini-dict')?.addEventListener('change', (e) => saveAndRefresh({ showMiniDictionary: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-hover-pause')?.addEventListener('change', (e) => saveAndRefresh({ hoverPauseAtCueEnd: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-rc-action')?.addEventListener('change', (e) => saveAndRefresh({ rightClickAction: e.target.value }));
    settingsModalEl.querySelector('#lt-set-show-ctrls')?.addEventListener('change', (e) => saveAndRefresh({ showSubtitleControls: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-hide-playbar')?.addEventListener('change', (e) => saveAndRefresh({ hidePlaybackBar: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-show-dock')?.addEventListener('change', (e) => saveAndRefresh({ showSubtitlesListView: e.target.checked }));
    settingsModalEl.querySelector('#lt-set-speak-click')?.addEventListener('change', (e) => saveAndRefresh({ autoSpeakOnClick: e.target.checked }));

    settingsModalEl.querySelector('#lt-set-hl-mode')?.addEventListener('change', (e) => saveAndRefresh({ vocabularyHighlighting: e.target.value }));
    settingsModalEl.querySelector('#lt-set-vocab-level')?.addEventListener('change', (e) => saveAndRefresh({ vocabLevelRank: Number(e.target.value) }));
    settingsModalEl.querySelector('#lt-set-show-tags')?.addEventListener('change', (e) => saveAndRefresh({ showTagsInText: e.target.checked }));

    ['known', 'suggested', 'learning', 'ignored'].forEach((key) => {
      settingsModalEl.querySelector(`#lt-col-${key}`)?.addEventListener('input', (e) => {
        saveAndRefresh({
          wordColorPreset: 'custom',
          wordColors: Object.assign({}, state.settings.wordColors, { [key]: e.target.value })
        });
      });
    });
  }

  function applyParsedCues(rawCues, videoId) {
    if (!Array.isArray(rawCues) || rawCues.length === 0) return false;
    if (
      state.videoId === videoId &&
      state.cues.length > rawCues.length &&
      !state.cues._isLiveDomFallback
    ) {
      return false;
    }
    state.videoId = videoId || state.videoId || getCurrentPageVideoId();
    state.videoTitle = document.title.replace(/ - YouTube$/, '');
    const normalized = rawCues.map((c) =>
      Object.assign({}, c, {
        startMs: Number(c.startMs ?? c.tStartMs ?? 0),
        endMs: Number(c.endMs ?? (Number(c.tStartMs || 0) + Number(c.dDurationMs || 2500)))
      })
    );
    state.cues = normalized;
    state.cues._isLiveDomFallback = false;

    const currentMs = videoEl ? videoEl.currentTime * 1000 : 0;
    const matchIdx = normalized.findIndex((c) => currentMs >= c.startMs && currentMs <= c.endMs);
    state.activeCueIndex = matchIdx !== -1 ? matchIdx : 0;

    renderSubtitleOverlay(true);
    renderRightDock();
    ensureCueTranslated(state.activeCueIndex);
    if (state.activeCueIndex + 1 < normalized.length) {
      ensureCueTranslated(state.activeCueIndex + 1);
    }
    return true;
  }

  function getCurrentPageVideoId() {
    try {
      return new URL(window.location.href).searchParams.get('v') || '';
    } catch (_e) {
      return '';
    }
  }

  async function loadCaptionsFromTimedTextUrl(url, videoId) {
    if (!url) return;
    const vid = videoId || getCurrentPageVideoId();
    if (state.videoId === vid && state.cues.length > 5 && !state.cues._isLiveDomFallback) {
      return;
    }
    try {
      const fetchUrl = url.includes('fmt=') ? url : `${url}&fmt=json3`;
      const res = await fetch(fetchUrl, { credentials: 'same-origin' });
      const rawText = await res.text();
      if (rawText && rawText.trim().length > 10) {
        const parsed = Parser && typeof Parser.parseAnyTimedTextPayload === 'function'
          ? Parser.parseAnyTimedTextPayload(rawText)
          : Parser.rebuildCleanSentencesFromJson3(JSON.parse(rawText));
        if (applyParsedCues(parsed, vid)) return;
      }
    } catch (_e) {}

    try {
      const res2 = await fetch(url, { credentials: 'same-origin' });
      const rawText2 = await res2.text();
      if (rawText2 && rawText2.trim().length > 10 && Parser && typeof Parser.parseAnyTimedTextPayload === 'function') {
        const parsed2 = Parser.parseAnyTimedTextPayload(rawText2);
        applyParsedCues(parsed2, vid);
      }
    } catch (_e) {}
  }

  window.addEventListener('LINGUATUBE_TIMEDTEXT_PAYLOAD', (event) => {
    const detail = (event && event.detail) || {};
    if (!detail.bodyText) return;
    const vid = detail.videoId || getCurrentPageVideoId();
    const parsed = Parser && typeof Parser.parseAnyTimedTextPayload === 'function'
      ? Parser.parseAnyTimedTextPayload(detail.bodyText)
      : [];
    applyParsedCues(parsed, vid);
  });

  window.addEventListener('LINGUATUBE_TIMEDTEXT_URL', (event) => {
    const detail = (event && event.detail) || {};
    if (detail.url) {
      loadCaptionsFromTimedTextUrl(detail.url, detail.videoId);
    }
  });

  window.addEventListener('yt-navigate-finish', () => {
    if (!isWatchPage()) {
      if (dockRoot) dockRoot.classList.add('lt-hidden');
      if (overlayRoot) overlayRoot.classList.add('lt-hidden');
      return;
    }
    if (overlayRoot) overlayRoot.classList.remove('lt-hidden');
    const newVid = getCurrentPageVideoId();
    if (newVid && newVid !== state.videoId) {
      state.videoId = newVid;
      state.cues = [];
      state.activeCueIndex = -1;
      renderSubtitleOverlay(true);
      renderRightDock();
      window.dispatchEvent(new CustomEvent('LINGUATUBE_REQUEST_PROBE'));
    } else {
      ensurePlayerOverlayMounted();
      ensureRightDockMounted();
      renderSubtitleOverlay(true);
      renderRightDock();
    }
  });

  async function init() {
    ensureMainWorldInterceptorInjected();
    await syncStorageState();
    bindKeyboardShortcuts();

    // Calm, non-blocking check ONLY on /watch pages (0 global MutationObservers)
    setInterval(() => {
      if (!isWatchPage()) return;
      const hadOverlay = Boolean(overlayRoot && document.contains(overlayRoot));
      const hadDock = Boolean(dockRoot && document.contains(dockRoot));
      const mountedOverlay = ensurePlayerOverlayMounted();
      const mountedDock = ensureRightDockMounted();
      if ((!hadOverlay && mountedOverlay) || (!hadDock && mountedDock)) {
        renderSubtitleOverlay(true);
        renderRightDock();
      }
      captureLiveDomCaptionIfNeeded();
    }, 500);

    // Smooth 50ms speaker-sync karaoke highlighter + exact end-of-cue hover-hold guard
    setInterval(() => {
      if (!isWatchPage() || !videoEl || videoEl.paused) return;
      checkHoverHoldEndOfCue();
      if (state.settings.wordByWordHighlight) {
        updateKaraokeWordHighlighting();
      }
    }, 50);

    if (isWatchPage()) {
      ensurePlayerOverlayMounted();
      ensureRightDockMounted();
      renderSubtitleOverlay(true);
      renderRightDock();
      window.dispatchEvent(new CustomEvent('LINGUATUBE_REQUEST_PROBE'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
