/**
 * Cunt Academy v4.0 — Portal Controller (`dashboard.js`)
 * Includes Manual-Flip 3D Flashcards (no 3s auto-flip timer), PhrasePump Cloze, Speed Match,
 * Listening & Sentence Scramble Builder, and Multi-Word Phrasal Verb management.
 */
(function () {
  'use strict';

  const Constants = globalThis.LTConstants;
  const Database = globalThis.LTDatabase;
  const ext = (Constants && Constants.getExtApi)
    ? Constants.getExtApi()
    : (typeof browser !== 'undefined' ? browser : null);

  const state = {
    activeNav: 'phrasepump',
    practiceMode: 'flashcard', // 'flashcard' | 'cloze' | 'match'
    cards: [],
    sentences: [],
    dueCards: [],
    reviewHistory: {},
    settings: Object.assign({}, Constants.DEFAULT_SETTINGS),
    pumpIndex: 0,
    pumpRevealed: false,
    matchedIds: [],
    selectedMatchEn: null,
    savedTypeFilter: 'all',
    savedStatusFilter: 'all',
    savedSearch: '',
    drillIndex: 0,
    builtWords: []
  };

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function speakText(text) {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } catch (_e) {
      // ignore
    }
  }

  async function refreshPortalData() {
    const [cards, sentences, dueCards, reviewHistory, settings, cloudAccount] = await Promise.all([
      Database.getAllCards(),
      Database.getAllSavedSentences(),
      Database.getDueCards(),
      Database.getReviewHistory(),
      Database.getSettings(),
      Database.getCloudAccount ? Database.getCloudAccount() : Promise.resolve(null)
    ]);

    state.cards = cards;
    state.sentences = sentences;
    state.dueCards = dueCards;
    state.reviewHistory = reviewHistory || {};
    state.settings = settings;
    state.cloudAccount = cloudAccount;

    renderCloudSyncBanner();
    renderPhrasePumpView();
    renderSavedItemsView();
    renderDrillsView();
    renderPortalSettingsView();
  }

  function renderCloudSyncBanner() {
    const container = document.getElementById('lr-cloud-sync-content');
    if (!container) return;
    const publicAppUrl = 'https://ais-pre-kpvvaywqip7q5ueoy2ov3t-258196294078.us-east1.run.app';
    if (state.cloudAccount && state.cloudAccount.email) {
      container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;" dir="rtl">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">☁</span>
            <div>
              <div style="font-size:13px;font-weight:800;color:#4ADE80;">
                متصل به اکانت جیمیل: <span dir="ltr" style="color:#fff;">${escapeHtml(state.cloudAccount.email)}</span>
              </div>
              <div style="font-size:11px;color:#CBD5E1;">
                تمام کلمات ذخیره‌شده در یوتیوب و فلش‌کارت‌های AnkiDroid با اکانت ابری شما همگام‌سازی می‌شوند.
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <a href="${publicAppUrl}" target="_blank" rel="noreferrer" class="lr-action-btn" style="text-decoration:none;">🌐 باز کردن سایت اصلی</a>
            <button type="button" class="lr-btn-purple" id="lr-cloud-sync-now-btn" style="background:#10B981;">🔄 همگام‌سازی فوری</button>
            <button type="button" class="lr-action-btn" id="lr-cloud-disconnect-btn">خروج</button>
          </div>
        </div>
      `;
      container.querySelector('#lr-cloud-sync-now-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.textContent = 'در حال همگام‌سازی...';
        try {
          await Database.syncWithCloudAccount();
          await refreshPortalData();
        } catch (err) {
          btn.textContent = err.message || 'خطا در سینک';
        }
      });
      container.querySelector('#lr-cloud-disconnect-btn')?.addEventListener('click', async () => {
        await Database.disconnectCloudAccount();
        await refreshPortalData();
      });
    } else {
      container.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;" dir="rtl">
          <div style="flex:1;min-width:240px;">
            <div style="font-size:13px;font-weight:800;color:#FDE047;">
              ☁ اتصال اکستنشن به اکانت جیمیل شخصی (Cloud Sync روی تمام دستگاه‌ها)
            </div>
            <div style="font-size:11px;color:#CBD5E1;">
              در <a href="${publicAppUrl}" target="_blank" rel="noreferrer" style="color:#4ADE80;text-decoration:underline;">سایت اصلی Cunt Academy</a> با جیمیل وارد شوید، «کد اتصال اکستنشن» را کپی کرده و اینجا قرار دهید:
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:280px;">
            <input type="text" id="lr-cloud-token-input" dir="ltr" placeholder="Paste Extension Cloud Sync Key..." style="flex:1;background:#0B0D14;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:7px 10px;font-size:11px;" />
            <button type="button" class="lr-btn-purple" id="lr-cloud-connect-btn" style="background:#10B981;white-space:nowrap;">اتصال به جیمیل</button>
          </div>
        </div>
      `;
      container.querySelector('#lr-cloud-connect-btn')?.addEventListener('click', async (e) => {
        const input = container.querySelector('#lr-cloud-token-input');
        const btn = e.currentTarget;
        if (!input || !input.value.trim()) return;
        btn.textContent = 'در حال اتصال...';
        try {
          await Database.connectCloudSyncToken(input.value.trim());
          await refreshPortalData();
        } catch (err) {
          btn.textContent = err.message || 'کد نامعتبر';
        }
      });
    }
  }

  if (ext && ext.storage && ext.storage.onChanged) {
    ext.storage.onChanged.addListener(() => {
      refreshPortalData();
    });
  }

  function renderPhrasePumpView() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayReviewed = state.reviewHistory[todayKey] || 0;
    const goal = state.settings.dailyReviewGoal || 20;

    const markedList = state.cards.filter((c) => c.status === 'learning' && (c.leitnerBox || 1) === 1);
    const learningNowList = state.cards.filter((c) => c.status === 'learning' && c.leitnerBox >= 2 && c.leitnerBox <= 4);
    const learnedList = state.cards.filter((c) => c.status === 'known' || c.leitnerBox >= 5);

    document.getElementById('pump-reviewed-today').textContent = `${todayReviewed} / ${goal}`;
    document.getElementById('pump-due-count').textContent = String(state.dueCards.length);
    document.getElementById('pump-total-count').textContent = String(state.cards.length);

    document.getElementById('pipe-marked-count').textContent = String(markedList.length);
    document.getElementById('pipe-learning-count').textContent = String(learningNowList.length);
    document.getElementById('pipe-learned-count').textContent = String(learnedList.length);

    const heatmapEl = document.getElementById('lr-heatmap-grid');
    if (heatmapEl) {
      const cells = [];
      const now = Date.now();
      for (let i = 55; i >= 0; i--) {
        const dKey = new Date(now - i * 86400000).toISOString().slice(0, 10);
        const count = state.reviewHistory[dKey] || 0;
        const lv = count === 0 ? '' : count < 5 ? 'lv-1' : count < 12 ? 'lv-2' : 'lv-3';
        cells.push(`<div class="lr-heat-cell ${lv}" title="${dKey}: ${count} reviews"></div>`);
      }
      heatmapEl.innerHTML = cells.join('');
    }

    const sessionArea = document.getElementById('pump-session-area');
    if (!sessionArea) return;

    if (state.cards.length === 0) {
      sessionArea.innerHTML = `
        <div style="text-align:center;padding:22px 0;">
          <p style="color:#94A3B8;margin-bottom:14px;">No saved vocabulary yet! Click words or drag across phrasal verbs on YouTube, or load sample vocabulary below.</p>
          <button type="button" class="lr-btn-purple" id="pump-empty-seed-btn">+ Load Words & Phrasal Verbs</button>
        </div>
      `;
      sessionArea.querySelector('#pump-empty-seed-btn')?.addEventListener('click', seedDemoVocabulary);
      return;
    }

    // Strict AnkiDroid Due-Only Queue (unless user explicitly clicked Custom Study Ahead)
    const queue = state.customStudyAhead ? state.cards.filter((c) => c.status !== 'ignored') : state.dueCards;
    if (queue.length === 0) {
      const futureCards = state.cards
        .filter((c) => c.status !== 'ignored' && (c.nextReviewAt || 0) > Date.now())
        .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
      const nextDays = futureCards[0]
        ? Math.max(1, Math.round(((futureCards[0].nextReviewAt || Date.now()) - Date.now()) / 86400000))
        : 1;

      sessionArea.innerHTML = `
        <div style="text-align:center;padding:28px 16px;">
          <div style="font-size:36px;margin-bottom:10px;">🎉</div>
          <h3 style="font-size:20px;font-weight:800;color:#4ADE80;margin-bottom:8px;">تبریک! مرورهای امروز این دسته به پایان رسید (Deck Finished for Today)</h3>
          <p style="color:#CBD5E1;font-size:14px;max-width:520px;margin:0 auto 16px;" dir="rtl">
            طبق الگوریتم اصلی <strong>AnkiDroid SM-2</strong>، کارت‌هایی که امروز پاسخ دادید به روزهای آینده منتقل شدند تا در یک روز صد بار تکرار نشوند. نزدیک‌ترین کارت بعدی در <strong>${nextDays} روز دیگر</strong> سررسید می‌شود.
          </p>
          <div style="display:flex;justify-content:center;gap:12px;">
            <button type="button" class="lr-action-btn" id="anki-custom-study-btn">⚡ مطالعه سفارشی / مرور زودتر از موعد (${futureCards.length} کارت)</button>
            <button type="button" class="lr-btn-purple" id="pump-empty-seed-btn">+ افزودن کلمات نمونه جدید</button>
          </div>
        </div>
      `;
      sessionArea.querySelector('#anki-custom-study-btn')?.addEventListener('click', () => {
        state.customStudyAhead = true;
        state.pumpIndex = 0;
        renderPhrasePumpView();
      });
      sessionArea.querySelector('#pump-empty-seed-btn')?.addEventListener('click', seedDemoVocabulary);
      return;
    }

    const activeCard = queue[state.pumpIndex % queue.length];
    const intervals = Constants && typeof Constants.computeAnkiNextIntervals === 'function'
      ? Constants.computeAnkiNextIntervals(activeCard)
      : { againLabel: '< 10m', hardLabel: '1d (فردا)', goodLabel: '1d (فردا)', easyLabel: '4d (۴ روز دیگر)' };

    // MODE 1: ANKIDROID MANUAL-FLIP FLASHCARD + 4 SM-2 INTERVAL BUTTONS + EDITABLE BACK OF CARD
    if (state.practiceMode === 'flashcard') {
      sessionArea.innerHTML = `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:12px;color:#A78BFA;font-weight:700;">
              ${activeCard.type === 'phrase' ? '🔗 PHRASAL VERB / IDIOM' : '📖 WORD'} • INTERVAL: ${activeCard.intervalDays || 0}d • EASE: ${Math.round((activeCard.easeFactor || 2.5) * 100)}% • ${escapeHtml(activeCard.cefr || 'B1')}
            </span>
            <div style="display:flex;gap:8px;">
              ${state.pumpRevealed ? `<button type="button" class="lr-action-btn" id="fc-edit-back-btn">✏️ ویرایش پشت کارت</button>` : ''}
              <button type="button" class="lr-action-btn" id="fc-speak-btn">🔊 Speak Audio</button>
            </div>
          </div>

          <div class="ca-flashcard-surface" id="fc-flip-card" title="Click anywhere on card to flip manually">
            ${
              !state.pumpRevealed
                ? `
                  <div style="font-size:11px;color:#94A3B8;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">FRONT • CLICK CARD TO FLIP</div>
                  <div style="font-size:28px;font-weight:800;color:#FFFFFF;margin-bottom:8px;">${escapeHtml(activeCard.word)}</div>
                  <div style="font-size:14px;color:#38BDF8;margin-bottom:14px;">${escapeHtml(activeCard.phonetic || '')}</div>
                  <div style="font-size:14px;color:#CBD5E1;max-width:520px;">"${escapeHtml(activeCard.contextSentence || '')}"</div>
                `
                : `
                  <div style="font-size:11px;color:#10B981;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">BACK • PERSIAN MEANING & NOTES</div>
                  <div style="font-size:24px;font-weight:800;color:#FFFFFF;margin-bottom:6px;">${escapeHtml(activeCard.word)}</div>
                  <div dir="rtl" style="font-size:22px;font-weight:800;color:#4ADE80;margin-bottom:10px;">${escapeHtml(activeCard.translation)}</div>
                  ${activeCard.customNotes ? `<div dir="rtl" style="font-size:14px;color:#86EFAC;background:rgba(16,185,129,0.12);padding:6px 12px;border-radius:8px;margin-bottom:10px;">📝 ${escapeHtml(activeCard.customNotes)}</div>` : ''}
                  <div dir="rtl" style="font-size:14px;color:#FDE047;margin-bottom:8px;">${escapeHtml(activeCard.contextTranslation || '')}</div>
                  ${activeCard.aiExplanation ? `<div dir="rtl" style="font-size:12px;color:#C4B5FD;">${escapeHtml(activeCard.aiExplanation)}</div>` : ''}
                `
            }
          </div>

          ${
            state.editingBack
              ? `
                <div style="background:#161926;border:1px solid rgba(16,185,129,0.4);border-radius:10px;padding:12px;margin-top:12px;">
                  <div style="font-size:12px;color:#4ADE80;font-weight:700;margin-bottom:8px;" dir="rtl">✏️ ویرایش معنی فارسی و یادداشت شخصی پشت کارت:</div>
                  <input type="text" id="fc-edit-fa-input" dir="rtl" value="${escapeHtml(activeCard.translation || '')}" placeholder="ترجمه فارسی..." style="width:100%;background:#0B0D14;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px;margin-bottom:8px;" />
                  <input type="text" id="fc-edit-notes-input" dir="rtl" value="${escapeHtml(activeCard.customNotes || '')}" placeholder="یادداشت شخصی، مترادف یا نکته گرامری..." style="width:100%;background:#0B0D14;color:#fde047;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px;margin-bottom:8px;" />
                  <div style="display:flex;justify-content:flex-end;gap:8px;">
                    <button type="button" class="lr-action-btn" id="fc-cancel-edit-btn">انصراف</button>
                    <button type="button" class="lr-btn-purple" id="fc-save-edit-btn" style="background:#10B981;">ذخیره تغییرات</button>
                  </div>
                </div>
              `
              : ''
          }

          ${
            !state.pumpRevealed
              ? `
                <div style="display:flex;gap:10px;margin-top:14px;">
                  <button type="button" class="lr-btn-purple" id="fc-flip-btn" style="flex:1;">👁 نمایش پاسخ پشت کارت (Show Answer)</button>
                </div>
              `
              : `
                <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-top:14px;">
                  <button type="button" class="lr-action-btn" data-anki-grade="again" style="border-color:#EF4444;color:#FCA5A5;display:flex;flex-direction:column;align-items:center;padding:10px;">
                    <span style="font-size:11px;opacity:0.85;">${escapeHtml(intervals.againLabel)}</span>
                    <strong style="font-size:14px;margin-top:2px;">Again (دوباره)</strong>
                  </button>
                  <button type="button" class="lr-action-btn" data-anki-grade="hard" style="border-color:#F59E0B;color:#FDE68A;display:flex;flex-direction:column;align-items:center;padding:10px;">
                    <span style="font-size:11px;opacity:0.85;">${escapeHtml(intervals.hardLabel)}</span>
                    <strong style="font-size:14px;margin-top:2px;">Hard (سخت)</strong>
                  </button>
                  <button type="button" class="lr-action-btn" data-anki-grade="good" style="border-color:#10B981;color:#86EFAC;display:flex;flex-direction:column;align-items:center;padding:10px;">
                    <span style="font-size:11px;opacity:0.85;">${escapeHtml(intervals.goodLabel)}</span>
                    <strong style="font-size:14px;margin-top:2px;">Good (خوب)</strong>
                  </button>
                  <button type="button" class="lr-action-btn" data-anki-grade="easy" style="border-color:#38BDF8;color:#BAE6FD;display:flex;flex-direction:column;align-items:center;padding:10px;">
                    <span style="font-size:11px;opacity:0.85;">${escapeHtml(intervals.easyLabel)}</span>
                    <strong style="font-size:14px;margin-top:2px;">Easy (آسان)</strong>
                  </button>
                </div>
              `
          }
        </div>
      `;

      const toggleFlip = () => {
        state.pumpRevealed = !state.pumpRevealed;
        state.editingBack = false;
        if (state.pumpRevealed) speakText(activeCard.word);
        renderPhrasePumpView();
      };

      sessionArea.querySelector('#fc-flip-card')?.addEventListener('click', toggleFlip);
      sessionArea.querySelector('#fc-flip-btn')?.addEventListener('click', toggleFlip);
      sessionArea.querySelector('#fc-speak-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(activeCard.contextSentence || activeCard.word);
      });
      sessionArea.querySelector('#fc-edit-back-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.editingBack = !state.editingBack;
        renderPhrasePumpView();
      });
      sessionArea.querySelector('#fc-cancel-edit-btn')?.addEventListener('click', () => {
        state.editingBack = false;
        renderPhrasePumpView();
      });
      sessionArea.querySelector('#fc-save-edit-btn')?.addEventListener('click', async () => {
        const nextFa = sessionArea.querySelector('#fc-edit-fa-input')?.value?.trim() || activeCard.translation;
        const nextNotes = sessionArea.querySelector('#fc-edit-notes-input')?.value?.trim() || '';
        await Database.updateCardBack(activeCard.id, { translation: nextFa, customNotes: nextNotes });
        state.editingBack = false;
        await refreshPortalData();
      });
      sessionArea.querySelectorAll('[data-anki-grade]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const grade = btn.getAttribute('data-anki-grade');
          state.pumpRevealed = false;
          state.editingBack = false;
          if (state.customStudyAhead) state.pumpIndex += 1;
          await Database.reviewCard(activeCard.id, grade);
          await refreshPortalData();
        });
      });
      return;
    }

    // MODE 2: SPEED MATCH (Pair English words/phrasal verbs with Persian meanings)
    if (state.practiceMode === 'match') {
      const subset = queue.slice(0, 5);
      sessionArea.innerHTML = `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:12px;color:#10B981;font-weight:700;">🧩 SYNAPSE SPEED MATCH — CLICK ENGLISH THEN PERSIAN</span>
            <button type="button" class="lr-action-btn" id="match-reset-btn">↻ Reset Board</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${subset
                .map((c) => {
                  const done = state.matchedIds.includes(c.id);
                  const active = state.selectedMatchEn === c.id;
                  return `<button type="button" class="lr-action-btn" data-match-en="${escapeHtml(c.id)}" ${done ? 'disabled' : ''} style="padding:12px;text-align:left;opacity:${done ? '0.35' : '1'};border-color:${active ? '#7C5CFC' : 'rgba(255,255,255,0.12)'};">${escapeHtml(c.word)}</button>`;
                })
                .join('')}
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${subset
                .slice()
                .reverse()
                .map((c) => {
                  const done = state.matchedIds.includes(c.id);
                  return `<button type="button" class="lr-action-btn" dir="rtl" data-match-fa="${escapeHtml(c.id)}" ${done ? 'disabled' : ''} style="padding:12px;text-align:right;opacity:${done ? '0.35' : '1'};color:#FDE047;">${escapeHtml(c.translation)}</button>`;
                })
                .join('')}
            </div>
          </div>
        </div>
      `;

      sessionArea.querySelector('#match-reset-btn')?.addEventListener('click', () => {
        state.matchedIds = [];
        state.selectedMatchEn = null;
        renderPhrasePumpView();
      });
      sessionArea.querySelectorAll('[data-match-en]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.selectedMatchEn = btn.getAttribute('data-match-en');
          renderPhrasePumpView();
        });
      });
      sessionArea.querySelectorAll('[data-match-fa]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const targetId = btn.getAttribute('data-match-fa');
          if (state.selectedMatchEn && state.selectedMatchEn === targetId) {
            state.matchedIds.push(targetId);
            state.selectedMatchEn = null;
            await Database.reviewCard(targetId, true);
            await refreshPortalData();
          } else {
            state.selectedMatchEn = null;
            renderPhrasePumpView();
          }
        });
      });
      return;
    }

    // MODE 3: PHRASEPUMP CLOZE
    const clozeSentence = activeCard.contextSentence
      ? activeCard.contextSentence.replace(new RegExp(activeCard.word, 'gi'), ' [ _____ ] ')
      : `Contextual usage of [ ${activeCard.word} ]`;

    sessionArea.innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-size:12px;color:#4ade80;font-weight:700;">STAGE ${activeCard.leitnerBox || 1} • ${escapeHtml(activeCard.cefr || 'B1')}</span>
          <button type="button" class="lr-action-btn" id="pump-speak-btn">🔊 Listen Word & Sentence</button>
        </div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">
          ${state.pumpRevealed ? escapeHtml(activeCard.contextSentence || activeCard.word) : escapeHtml(clozeSentence)}
        </div>
        <div style="font-size:15px;color:#fde047;margin-bottom:14px;" dir="rtl">
          ${escapeHtml(activeCard.contextTranslation || activeCard.translation)}
        </div>

        ${
          state.pumpRevealed
            ? `
          <div style="padding:12px;background:#161924;border-radius:8px;margin-bottom:14px;">
            <div style="font-size:20px;font-weight:800;color:#fff;">${escapeHtml(activeCard.word)} <span style="font-size:13px;color:#38bdf8;">${escapeHtml(activeCard.phonetic || '')}</span> — <span dir="rtl" style="color:#4ade80;">${escapeHtml(activeCard.translation)}</span></div>
            ${activeCard.aiExplanation ? `<div dir="rtl" style="font-size:12px;color:#d8b4fe;margin-top:6px;">${escapeHtml(activeCard.aiExplanation)}</div>` : ''}
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="lr-action-btn" id="pump-grade-fail" style="flex:1;border-color:#ef4444;color:#fca5a5;">Forgot (Reset to Stage 1)</button>
            <button type="button" class="lr-btn-purple" id="pump-grade-pass" style="flex:1;background:#16a34a;">✓ Remembered (Promote Stage)</button>
          </div>`
            : `<button type="button" class="lr-btn-purple" id="pump-reveal-btn" style="width:100%;">Reveal Answer & Pronunciation</button>`
        }
      </div>
    `;

    sessionArea.querySelector('#pump-speak-btn')?.addEventListener('click', () => {
      speakText(activeCard.contextSentence || activeCard.word);
    });
    sessionArea.querySelector('#pump-reveal-btn')?.addEventListener('click', () => {
      state.pumpRevealed = true;
      speakText(activeCard.word);
      renderPhrasePumpView();
    });
    sessionArea.querySelector('#pump-grade-fail')?.addEventListener('click', async () => {
      state.pumpRevealed = false;
      await Database.reviewCard(activeCard.id, false);
      await refreshPortalData();
    });
    sessionArea.querySelector('#pump-grade-pass')?.addEventListener('click', async () => {
      state.pumpRevealed = false;
      state.pumpIndex += 1;
      await Database.reviewCard(activeCard.id, true);
      await refreshPortalData();
    });
  }

  function renderSavedItemsView() {
    const tbody = document.getElementById('saved-table-body');
    if (!tbody) return;

    if (state.savedTypeFilter === 'sentence') {
      tbody.innerHTML = state.sentences.length === 0
        ? `<tr><td colspan="7" style="text-align:center;color:#a1a1aa;">No saved sentences yet. Press 'S' while watching YouTube!</td></tr>`
        : state.sentences
            .map(
              (s) => `
          <tr>
            <td><span class="dot purple"></span> Sentence</td>
            <td><strong>${escapeHtml(s.text)}</strong></td>
            <td dir="rtl">${escapeHtml(s.translation)}</td>
            <td>—</td>
            <td>—</td>
            <td>${escapeHtml(s.videoTitle || 'YouTube')}</td>
            <td><button type="button" class="lr-action-btn" data-del-sent="${escapeHtml(s.id)}">🗑</button></td>
          </tr>`
            )
            .join('');
      tbody.querySelectorAll('[data-del-sent]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await Database.deleteSavedSentence(btn.getAttribute('data-del-sent'));
          await refreshPortalData();
        });
      });
      return;
    }

    const q = state.savedSearch.toLowerCase().trim();
    const filtered = state.cards.filter((c) => {
      if (state.savedTypeFilter === 'word' && c.type === 'phrase') return false;
      if (state.savedTypeFilter === 'phrase' && c.type !== 'phrase') return false;
      if (state.savedStatusFilter !== 'all' && c.status !== state.savedStatusFilter) return false;
      if (q) {
        const hay = `${c.word} ${c.translation} ${c.contextSentence}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7" style="text-align:center;color:#a1a1aa;">No matching saved vocabulary items.</td></tr>`
      : filtered
          .map(
            (c) => `
        <tr>
          <td>
            <select data-row-status="${escapeHtml(c.id)}" style="background:#0B0D14;color:#fff;border:1px solid #3f3f46;border-radius:6px;padding:4px 6px;">
              <option value="learning" ${c.status === 'learning' ? 'selected' : ''}>📖 Learning (Box ${c.leitnerBox || 1})</option>
              <option value="known" ${c.status === 'known' ? 'selected' : ''}>✓ Known</option>
              <option value="ignored" ${c.status === 'ignored' ? 'selected' : ''}>⊘ Ignore</option>
            </select>
          </td>
          <td>
            <button type="button" class="lr-action-btn" data-speak-word="${escapeHtml(c.word)}">🔊</button>
            <strong style="margin-left:6px;">${escapeHtml(c.word)}</strong>
            ${c.type === 'phrase' ? '<span style="margin-left:6px;font-size:10px;background:rgba(124,92,252,0.25);color:#C4B5FD;padding:2px 6px;border-radius:4px;">PHRASE</span>' : ''}
          </td>
          <td dir="rtl" style="color:#fde047;font-weight:600;">${escapeHtml(c.translation)}</td>
          <td>${escapeHtml(c.contextSentence || '—')}</td>
          <td>${escapeHtml(c.cefr || 'B1')} (${escapeHtml(c.freqTag || 'tag 2k')})</td>
          <td>${escapeHtml(c.videoTitle || 'YouTube')}</td>
          <td><button type="button" class="lr-action-btn" data-del-card="${escapeHtml(c.id)}">🗑</button></td>
        </tr>`
          )
          .join('');

    tbody.querySelectorAll('[data-speak-word]').forEach((btn) => {
      btn.addEventListener('click', () => speakText(btn.getAttribute('data-speak-word')));
    });

    tbody.querySelectorAll('[data-row-status]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-row-status');
        const card = await Database.getCardByWord(id);
        if (card) {
          await Database.saveCard(Object.assign({}, card, { status: sel.value }));
          await refreshPortalData();
        }
      });
    });

    tbody.querySelectorAll('[data-del-card]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await Database.deleteCard(btn.getAttribute('data-del-card'));
        await refreshPortalData();
      });
    });
  }

  function renderDrillsView() {
    const box = document.getElementById('drills-stage-box');
    if (!box) return;
    const pool = state.cards.length > 0 ? state.cards : [];
    if (!pool.length) {
      box.innerHTML = `<p style="margin-top:16px;color:#94A3B8;">Save words or phrasal verbs from YouTube or click "+ Load Words & Phrasal Verbs" in the sidebar to unlock Sentence Builder Drills.</p>`;
      return;
    }
    const item = pool[state.drillIndex % pool.length];
    box.innerHTML = `
      <div style="background:#121521;border:1px solid rgba(124,92,252,0.3);border-radius:14px;padding:22px;margin-top:16px;">
        <div style="font-size:12px;color:#A78BFA;font-weight:700;margin-bottom:8px;">ACTIVE RECALL & AUDIO SHADOWING #${(state.drillIndex % pool.length) + 1}</div>
        <h3 style="font-size:20px;margin-bottom:8px;">${escapeHtml(item.contextSentence || `Use "${item.word}" in context`)}</h3>
        <p dir="rtl" style="color:#fde047;font-size:15px;margin-bottom:14px;">${escapeHtml(item.contextTranslation || item.translation)}</p>
        <div style="display:flex;gap:10px;">
          <button type="button" class="lr-btn-purple" id="drill-listen-btn">🔊 Shadow Native Audio</button>
          <button type="button" class="lr-action-btn" id="drill-next-btn">Next Drill →</button>
        </div>
      </div>
    `;
    box.querySelector('#drill-listen-btn')?.addEventListener('click', () => speakText(item.contextSentence || item.word));
    box.querySelector('#drill-next-btn')?.addEventListener('click', () => {
      state.drillIndex += 1;
      renderDrillsView();
    });
  }

  function renderPortalSettingsView() {
    const container = document.getElementById('portal-settings-container');
    if (!container) return;
    const s = state.settings;

    container.innerHTML = `
      <div style="background:#121521;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:24px;max-width:860px;">
        <h2 style="margin-bottom:16px;">⚙ Cunt Academy — Subtitle & Language Reactor Settings</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <div>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Word-by-Word Speaker Highlighting (Trancy Karaoke)</span>
              <input type="checkbox" id="ps-karaoke" ${s.wordByWordHighlight !== false ? 'checked' : ''} />
            </label>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Hover Hold Auto-Pause at End of Cue</span>
              <input type="checkbox" id="ps-hoverpause" ${s.hoverPauseAtCueEnd !== false ? 'checked' : ''} />
            </label>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Hide YouTube Playback Bar unless mouse at bottom</span>
              <input type="checkbox" id="ps-hide-playbar" ${s.hidePlaybackBar ? 'checked' : ''} />
            </label>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Auto-pause after each subtitle (AP)</span>
              <input type="checkbox" id="ps-autopause" ${s.autoPausePerCue ? 'checked' : ''} />
            </label>
          </div>
          <div>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Subtitle Background Opacity (${s.subtitleBgOpacity ?? 75}%)</span>
              <input type="range" id="ps-opacity" min="0" max="100" value="${s.subtitleBgOpacity ?? 75}" />
            </label>
            <label style="display:flex;justify-content:space-between;margin-bottom:12px;">
              <span>Subtitle Text Style</span>
              <select id="ps-text-style" style="background:#0B0D14;color:#fff;padding:4px 8px;border-radius:6px;">
                <option value="shadow" ${s.subtitleTextStyle === 'shadow' ? 'selected' : ''}>Drop Shadow</option>
                <option value="outline" ${s.subtitleTextStyle === 'outline' ? 'selected' : ''}>Crisp Outline</option>
                <option value="raised" ${s.subtitleTextStyle === 'raised' ? 'selected' : ''}>3D Raised</option>
                <option value="netflix" ${s.subtitleTextStyle === 'netflix' ? 'selected' : ''}>Cinema Bold</option>
                <option value="none" ${s.subtitleTextStyle === 'none' ? 'selected' : ''}>Clean Minimal</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#ps-karaoke')?.addEventListener('change', async (e) => {
      await Database.saveSettings({ wordByWordHighlight: e.target.checked });
      await refreshPortalData();
    });
    container.querySelector('#ps-hoverpause')?.addEventListener('change', async (e) => {
      await Database.saveSettings({ hoverPauseAtCueEnd: e.target.checked });
      await refreshPortalData();
    });
    container.querySelector('#ps-hide-playbar')?.addEventListener('change', async (e) => {
      await Database.saveSettings({ hidePlaybackBar: e.target.checked });
      await refreshPortalData();
    });
    container.querySelector('#ps-autopause')?.addEventListener('change', async (e) => {
      await Database.saveSettings({ autoPausePerCue: e.target.checked });
      await refreshPortalData();
    });
    container.querySelector('#ps-opacity')?.addEventListener('input', async (e) => {
      await Database.saveSettings({ subtitleBgOpacity: Number(e.target.value) });
      await refreshPortalData();
    });
    container.querySelector('#ps-text-style')?.addEventListener('change', async (e) => {
      await Database.saveSettings({ subtitleTextStyle: e.target.value });
      await refreshPortalData();
    });
  }

  async function seedDemoVocabulary() {
    const samples = [
      {
        word: 'going through',
        type: 'phrase',
        translation: 'پشت سر گذاشتن، تجربه کردن، عبور کردن از',
        pos: 'phrasal verb',
        phonetic: '/ˈɡoʊɪŋ θruː/',
        contextSentence: 'We are going through a revolution right now in language learning.',
        contextTranslation: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب در یادگیری زبان هستیم.',
        aiExplanation: 'عبارت فعلی چندکلمه‌ای (Phrasal Verb • B1)',
        videoTitle: 'Cunt Academy — Language Reactor Showcase',
        status: 'learning',
        leitnerBox: 1
      },
      {
        word: 'most people',
        type: 'phrase',
        translation: 'اکثر مردم، بیشتر افراد',
        pos: 'collocation',
        phonetic: '/moʊst ˈpiːpəl/',
        contextSentence: 'Now most people will probably fall somewhere in between.',
        contextTranslation: 'حالا اکثر مردم احتمالاً جایی در این میان قرار می‌گیرند.',
        aiExplanation: 'هم‌نشینی پرتکرار (Collocation • A2)',
        videoTitle: 'Cunt Academy — Language Reactor Showcase',
        status: 'learning',
        leitnerBox: 2
      },
      {
        word: 'revolution',
        type: 'word',
        translation: 'انقلاب، دگرگونی بنیادین، چرخش',
        pos: 'noun',
        phonetic: '/ˌrevəˈluːʃən/',
        contextSentence: 'We are going through a revolution right now.',
        contextTranslation: 'ما همین الان در حال تجربه یک انقلاب هستیم.',
        aiExplanation: 'اسم (سطح B1 • tag 1k)',
        videoTitle: 'Cunt Academy — Language Reactor Showcase',
        status: 'learning',
        leitnerBox: 1
      },
      {
        word: 'figure out',
        type: 'phrase',
        translation: 'سر درآوردن، فهمیدن، کشف کردن راه حل',
        pos: 'phrasal verb',
        phonetic: '/ˈfɪɡjər aʊt/',
        contextSentence: 'You can quickly figure out the exact meaning of any phrasal verb.',
        contextTranslation: 'می‌توانید به سرعت معنی دقیق هر فعل عبارتی را بفهمید.',
        aiExplanation: 'فعل عبارتی جدایی‌پذیر (Phrasal Verb • B1)',
        videoTitle: 'Cunt Academy — Trancy Showcase',
        status: 'learning',
        leitnerBox: 3
      }
    ];

    for (const item of samples) {
      await Database.saveCard(item);
    }
    await refreshPortalData();
  }

  function bindEvents() {
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeNav = btn.getAttribute('data-nav');
        document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.lr-view').forEach((v) => v.classList.toggle('active', v.id === `view-${state.activeNav}`));
      });
    });

    document.querySelectorAll('[data-practice-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.practiceMode = btn.getAttribute('data-practice-mode');
        state.pumpRevealed = false;
        document.querySelectorAll('[data-practice-mode]').forEach((b) => b.classList.toggle('active', b === btn));
        renderPhrasePumpView();
      });
    });

    document.querySelectorAll('[data-saved-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.savedTypeFilter = btn.getAttribute('data-saved-type');
        document.querySelectorAll('[data-saved-type]').forEach((b) => b.classList.toggle('active', b === btn));
        renderSavedItemsView();
      });
    });

    document.getElementById('saved-search-input')?.addEventListener('input', (e) => {
      state.savedSearch = e.target.value;
      renderSavedItemsView();
    });

    document.getElementById('saved-status-filter')?.addEventListener('change', (e) => {
      state.savedStatusFilter = e.target.value;
      renderSavedItemsView();
    });

    document.getElementById('lr-seed-demo-btn')?.addEventListener('click', seedDemoVocabulary);

    document.getElementById('lr-export-json-btn')?.addEventListener('click', async () => {
      const data = await Database.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cunt-academy-backup.json';
      a.click();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    await refreshPortalData();
  });
})();
