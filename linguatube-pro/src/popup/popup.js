/**
 * Cunt Academy v4.7 — Compact Toolbar Popup Controller (`src/popup/popup.js`)
 * Provides:
 * 1. Authentic AnkiDroid SM-2 & 5-Box Leitner Flashcard Review right in the browser corner popup
 * 2. Inline Back-of-Card Customization (Edit Persian Meaning & Personal Notes)
 * 3. Quick Word/Phrase Adder + Saved Vocabulary Search
 * 4. Direct Website Link at the bottom + Cloud Account Sync
 */
(function () {
  'use strict';

  const Constants = globalThis.LTConstants;
  const Database = globalThis.LTDatabase;
  const ext = Constants && Constants.getExtApi ? Constants.getExtApi() : (typeof browser !== 'undefined' ? browser : null);

  const DEFAULT_WEBSITE_URL = 'https://ais-pre-kpvvaywqip7q5ueoy2ov3t-258196294078.us-east1.run.app';

  const DEMO_SEED_CARDS = [
    {
      id: 'going through',
      word: 'going through',
      lemma: 'go through',
      type: 'phrase',
      pos: 'phrasal verb',
      phonetic: '/ˈɡoʊɪŋ θruː/',
      translation: 'پشت سر گذاشتن، تجربه کردن، بررسی کردن',
      customNotes: 'فعل عبارتی پرتکرار در مکالمات روزمره و ویدیوها',
      contextSentence: 'We are going through a revolution right now with most people learning faster.',
      contextTranslation: 'ما همین الان در حال پشت سر گذاشتن یک انقلاب هستیم و اکثر مردم سریع‌تر یاد می‌گیرند.',
      aiExplanation: 'نقش دستوری: phrasal verb — معنی دقیق در این دیالوگ: «پشت سر گذاشتن / تجربه کردن یک دوره»',
      cefr: 'B1',
      freqTag: 'tag 2k',
      status: 'learning',
      ankiState: 'new',
      intervalDays: 0,
      box: 1,
      leitnerBox: 1,
      easeFactor: 2.5,
      nextReviewAt: Date.now() - 60000
    },
    {
      id: 'revolution',
      word: 'revolution',
      lemma: 'revolution',
      type: 'word',
      pos: 'noun',
      phonetic: '/ˌrevəˈluːʃən/',
      translation: 'انقلاب، دگرگونی بنیادین، تحول عظیم',
      customNotes: '',
      contextSentence: 'We are going through a revolution right now.',
      contextTranslation: 'ما همین الان در حال تجربه یک تحول عظیم هستیم.',
      aiExplanation: 'نقش دستوری: noun (سطح B1 • tag 2k) — به معنی تحول بنیادین در فناوری یا جامعه',
      cefr: 'B1',
      freqTag: 'tag 2k',
      status: 'learning',
      ankiState: 'learning',
      intervalDays: 1,
      box: 2,
      leitnerBox: 2,
      easeFactor: 2.5,
      nextReviewAt: Date.now() - 30000
    },
    {
      id: 'come up with',
      word: 'come up with',
      lemma: 'come up with',
      type: 'phrase',
      pos: 'phrasal verb',
      phonetic: '/kʌm ʌp wɪð/',
      translation: 'ابداع کردن، به ذهن رسیدن، ارائه دادن (ایده/راه‌حل)',
      customNotes: 'معمولاً همراه با an idea / a prompt / a plan می‌آید',
      contextSentence: 'When you come up with a detailed prompt, this resilient generator creates art.',
      contextTranslation: 'وقتی یک پرامپت دقیق ابداع می‌کنید، این مولد مقاوم هنر خلق می‌کند.',
      aiExplanation: 'نقش دستوری: phrasal verb — ارائه کردن یا خلق یک ایده یا راه‌حل جدید',
      cefr: 'B2',
      freqTag: 'tag 3k',
      status: 'learning',
      ankiState: 'review',
      intervalDays: 4,
      box: 3,
      leitnerBox: 3,
      easeFactor: 2.5,
      nextReviewAt: Date.now() - 10000
    }
  ];

  const state = {
    activeTab: 'review',
    cards: [],
    selectedBoxFilter: 'due', // 'due' | 'cram' | 1 | 2 | 3 | 4 | 5 | 6
    currentCardIndex: 0,
    isAnswerShown: false,
    isEditingBack: false,
    searchQuery: '',
    websiteUrl: DEFAULT_WEBSITE_URL,
    cloudAccount: null
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
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch (_e) {
      // ignore
    }
  }

  async function loadAllState() {
    let cards = await Database.getAllCards();
    if (!cards || cards.length === 0) {
      for (const item of DEMO_SEED_CARDS) {
        await Database.saveCard(item);
      }
      cards = await Database.getAllCards();
    }
    state.cards = cards;
    state.cloudAccount = await Database.getCloudAccount();
    const settings = await Database.getSettings();
    if (settings && settings.publicWebsiteUrl) {
      state.websiteUrl = settings.publicWebsiteUrl;
    }
    updateFooterWebsiteLink();
    updateCloudHeaderBadge();
    renderAll();
  }

  function updateFooterWebsiteLink() {
    const linkEl = document.getElementById('popup-open-website-link');
    const inputEl = document.getElementById('popup-site-url-input');
    if (linkEl) linkEl.href = state.websiteUrl || DEFAULT_WEBSITE_URL;
    if (inputEl && !inputEl.value) inputEl.value = state.websiteUrl || DEFAULT_WEBSITE_URL;
  }

  function updateCloudHeaderBadge() {
    const labelEl = document.getElementById('popup-cloud-label');
    const statusBox = document.getElementById('popup-cloud-status-box');
    if (state.cloudAccount && state.cloudAccount.email) {
      if (labelEl) labelEl.textContent = `☁ ${state.cloudAccount.email.split('@')[0]}`;
      if (statusBox) {
        statusBox.textContent = `✓ متصل به اکانت جیمیل: ${state.cloudAccount.email}`;
      }
    } else {
      if (labelEl) labelEl.textContent = '☁ سینک ابری';
      if (statusBox) {
        statusBox.textContent = 'هنوز کد اتصال اکانت جیمیل وارد نشده است.';
      }
    }
  }

  function getFilteredReviewQueue() {
    const now = Date.now();
    const activeCards = state.cards.filter((c) => c.status !== 'ignored');

    if (state.selectedBoxFilter === 'cram') {
      return activeCards;
    }
    if (typeof state.selectedBoxFilter === 'number') {
      return activeCards.filter((c) => Number(c.box || c.leitnerBox || 1) === state.selectedBoxFilter);
    }
    // Default: 'due' (AnkiDroid cards due right now)
    return activeCards
      .filter((c) => (c.nextReviewAt || 0) <= now)
      .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
  }

  function renderAll() {
    const now = Date.now();
    const activeCards = state.cards.filter((c) => c.status !== 'ignored');
    const dueCards = activeCards.filter((c) => (c.nextReviewAt || 0) <= now);
    const newCount = dueCards.filter((c) => (c.ankiState || 'new') === 'new' || Number(c.reviewCount || 0) === 0).length;
    const learningCount = dueCards.filter((c) => c.ankiState === 'learning' || c.ankiState === 'relearning').length;
    const reviewCount = Math.max(0, dueCards.length - newCount - learningCount);
    const masteredCount = activeCards.filter((c) => Number(c.box || c.leitnerBox || 1) >= 5 || c.status === 'known').length;

    document.getElementById('tab-due-badge').textContent = String(dueCards.length);
    document.getElementById('tab-total-badge').textContent = String(state.cards.length);
    document.getElementById('count-new').textContent = String(newCount);
    document.getElementById('count-learning').textContent = String(learningCount);
    document.getElementById('count-review').textContent = String(reviewCount);
    document.getElementById('count-mastered').textContent = String(masteredCount);

    renderMiniLeitnerBar(activeCards, dueCards.length);
    renderReviewStage();
    renderLeitnerBoxesTab(activeCards);
    renderSavedWordsTab();
  }

  function renderMiniLeitnerBar(activeCards, dueCount) {
    const bar = document.getElementById('mini-leitner-filter-bar');
    if (!bar) return;

    const boxCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const c of activeCards) {
      const b = Math.min(6, Math.max(1, Number(c.box || c.leitnerBox || 1)));
      boxCounts[b] = (boxCounts[b] || 0) + 1;
    }

    const items = [
      { key: 'due', label: `⚡ موعد امروز (${dueCount})` },
      { key: 1, label: `جعبه ۱ (${boxCounts[1]})` },
      { key: 2, label: `جعبه ۲ (${boxCounts[2]})` },
      { key: 3, label: `جعبه ۳ (${boxCounts[3]})` },
      { key: 4, label: `جعبه ۴ (${boxCounts[4]})` },
      { key: 5, label: `جعبه ۵ (${boxCounts[5]})` },
      { key: 6, label: `★ تثبیت‌شده (${boxCounts[6]})` }
    ];

    bar.innerHTML = items
      .map(
        (it) =>
          `<button type="button" class="ca-mini-box-chip ${state.selectedBoxFilter === it.key ? 'active' : ''}" data-box-filter="${it.key}">${escapeHtml(it.label)}</button>`
      )
      .join('');

    bar.querySelectorAll('[data-box-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.getAttribute('data-box-filter');
        state.selectedBoxFilter = raw === 'due' || raw === 'cram' ? raw : Number(raw);
        state.currentCardIndex = 0;
        state.isAnswerShown = false;
        state.isEditingBack = false;
        renderAll();
      });
    });
  }

  function renderReviewStage() {
    const stage = document.getElementById('popup-card-stage');
    if (!stage) return;

    const queue = getFilteredReviewQueue();
    if (queue.length === 0) {
      stage.innerHTML = `
        <div class="ca-empty-stage">
          <div class="ca-empty-title">🎉 تمام کارت‌های این بخش مرور شدند!</div>
          <p class="ca-empty-sub">
            طبق الگوریتم AnkiDroid SM-2، کارت‌های پاسخ داده‌شده به روزهای آینده (1d, 4d, 10d...) منتقل شدند تا حافظه بلندمدت شما تقویت شود.
          </p>
          <button type="button" id="popup-start-cram-btn" class="ca-show-answer-btn">
            🔄 مرور آزاد همه کارت‌ها (${state.cards.length} کارت)
          </button>
        </div>
      `;
      stage.querySelector('#popup-start-cram-btn')?.addEventListener('click', () => {
        state.selectedBoxFilter = 'cram';
        state.currentCardIndex = 0;
        state.isAnswerShown = false;
        renderAll();
      });
      return;
    }

    if (state.currentCardIndex >= queue.length) {
      state.currentCardIndex = 0;
    }
    const card = queue[state.currentCardIndex];
    const boxNum = Math.min(6, Math.max(1, Number(card.box || card.leitnerBox || 1)));
    const intervals = Constants.computeAnkiNextIntervals(card);

    stage.innerHTML = `
      <div class="ca-flashcard">
        <div class="ca-card-top-meta">
          <span class="ca-box-tag">${boxNum === 6 ? '★ Mastered (جعبه ۶)' : `📦 جعبه لایتنر ${boxNum}`}</span>
          <span dir="ltr">${escapeHtml(card.cefr || 'B1')} • ${state.currentCardIndex + 1} / ${queue.length}</span>
        </div>

        <div class="ca-card-front">
          <div class="ca-word-row" dir="ltr">
            <strong class="ca-word-en">${escapeHtml(card.word)}</strong>
            <button type="button" class="ca-speak-btn" id="popup-speak-word-btn" title="تلفظ صوتی">🔊</button>
          </div>
          ${card.phonetic ? `<div class="ca-phonetic" dir="ltr">${escapeHtml(card.phonetic)}</div>` : ''}
          ${
            card.contextSentence
              ? `<div class="ca-context-en">"${escapeHtml(card.contextSentence)}"</div>`
              : ''
          }
        </div>

        ${
          !state.isAnswerShown
            ? `<button type="button" id="popup-show-answer-btn" class="ca-show-answer-btn">
                 👁 نمایش پاسخ و زمان‌بندی AnkiDroid
               </button>`
            : `
              <div class="ca-card-back">
                <div class="ca-back-header">
                  <div class="ca-meaning-fa">${escapeHtml(card.translation || card.word)}</div>
                  <button type="button" id="popup-toggle-edit-back" class="ca-edit-back-btn">✏️ ویرایش پشت کارت</button>
                </div>

                ${
                  card.customNotes
                    ? `<div class="ca-notes-fa">📝 ${escapeHtml(card.customNotes)}</div>`
                    : ''
                }

                ${
                  card.aiExplanation
                    ? `<div class="ca-ai-note">✨ ${escapeHtml(card.aiExplanation)}</div>`
                    : ''
                }

                ${
                  state.isEditingBack
                    ? `
                      <div class="ca-inline-edit-box">
                        <input type="text" id="popup-edit-fa-input" value="${escapeHtml(card.translation || '')}" placeholder="معنی فارسی دلخواه..." />
                        <input type="text" id="popup-edit-note-input" value="${escapeHtml(card.customNotes || '')}" placeholder="یادداشت شخصی پشت کارت..." />
                        <button type="button" id="popup-save-back-btn" class="ca-btn-emerald">💾 ذخیره تغییرات پشت کارت</button>
                      </div>
                    `
                    : ''
                }

                <div class="ca-anki-grade-grid">
                  <button type="button" class="ca-grade-btn again" data-grade="again">
                    <span class="ca-grade-ivl">&lt;10m</span>
                    <span class="ca-grade-lbl">Again</span>
                    <span class="ca-grade-fa">فراموش کردم</span>
                  </button>
                  <button type="button" class="ca-grade-btn hard" data-grade="hard">
                    <span class="ca-grade-ivl">${intervals.hardDays}d</span>
                    <span class="ca-grade-lbl">Hard</span>
                    <span class="ca-grade-fa">سخت بود</span>
                  </button>
                  <button type="button" class="ca-grade-btn good" data-grade="good">
                    <span class="ca-grade-ivl">${intervals.goodDays}d</span>
                    <span class="ca-grade-lbl">Good</span>
                    <span class="ca-grade-fa">خوب بلدم</span>
                  </button>
                  <button type="button" class="ca-grade-btn easy" data-grade="easy">
                    <span class="ca-grade-ivl">${intervals.easyDays}d</span>
                    <span class="ca-grade-lbl">Easy</span>
                    <span class="ca-grade-fa">خیلی آسان</span>
                  </button>
                </div>
              </div>
            `
        }
      </div>
    `;

    stage.querySelector('#popup-speak-word-btn')?.addEventListener('click', () => {
      speakText(card.word);
    });

    stage.querySelector('#popup-show-answer-btn')?.addEventListener('click', () => {
      state.isAnswerShown = true;
      speakText(card.word);
      renderReviewStage();
    });

    stage.querySelector('#popup-toggle-edit-back')?.addEventListener('click', () => {
      state.isEditingBack = !state.isEditingBack;
      renderReviewStage();
    });

    stage.querySelector('#popup-save-back-btn')?.addEventListener('click', async () => {
      const nextFa = stage.querySelector('#popup-edit-fa-input')?.value?.trim() || card.translation;
      const nextNote = stage.querySelector('#popup-edit-note-input')?.value?.trim() || '';
      await Database.updateCardBack(card.id || card.word, {
        translation: nextFa,
        customNotes: nextNote
      });
      state.isEditingBack = false;
      await loadAllState();
    });

    stage.querySelectorAll('[data-grade]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const grade = btn.getAttribute('data-grade');
        await Database.reviewCard(card.id || card.word, grade);
        state.isAnswerShown = false;
        state.isEditingBack = false;
        await loadAllState();
      });
    });
  }

  function renderLeitnerBoxesTab(activeCards) {
    const grid = document.getElementById('popup-leitner-boxes-grid');
    if (!grid) return;

    const boxesMeta = [
      { box: 1, title: 'جعبه ۱ — کلمات جدید و در حال یادگیری', sub: 'مرور فوری / روزانه (New & Relearning)' },
      { box: 2, title: 'جعبه ۲ — فاصله زمانی ۱ تا ۲ روز', sub: 'تثبیت اولیه در حافظه کوتاه‌مدت' },
      { box: 3, title: 'جعبه ۳ — فاصله زمانی ۴ روز', sub: 'مرور میان‌مدت AnkiDroid SM-2' },
      { box: 4, title: 'جعبه ۴ — فاصله زمانی ۸ تا ۱۰ روز', sub: 'انتقال به حافظه بلندمدت' },
      { box: 5, title: 'جعبه ۵ — فاصله زمانی ۱۶ روز', sub: 'آستانه تسلط کامل' },
      { box: 6, title: '★ جعبه ۶ — تثبیت‌شده (Mastered)', sub: 'فاصله ۳۰+ روز (کلمات سبز Known)' }
    ];

    grid.innerHTML = boxesMeta
      .map((meta) => {
        const count = activeCards.filter((c) => Number(c.box || c.leitnerBox || 1) === meta.box).length;
        return `
          <div class="ca-leitner-box-card" data-open-box="${meta.box}">
            <div>
              <div class="ca-box-info-title">${escapeHtml(meta.title)}</div>
              <div class="ca-box-info-sub">${escapeHtml(meta.sub)}</div>
            </div>
            <span class="ca-box-count-pill">${count} کارت</span>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-open-box]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedBoxFilter = Number(row.getAttribute('data-open-box'));
        state.currentCardIndex = 0;
        state.isAnswerShown = false;
        switchTab('review');
        renderAll();
      });
    });
  }

  function renderSavedWordsTab() {
    const listEl = document.getElementById('popup-words-list');
    if (!listEl) return;

    const q = state.searchQuery.trim().toLowerCase();
    const filtered = state.cards.filter((c) => {
      if (!q) return true;
      return (
        String(c.word || '').toLowerCase().includes(q) ||
        String(c.translation || '').toLowerCase().includes(q) ||
        String(c.customNotes || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="ca-empty-sub" style="text-align:center;padding:18px 0;">کلمه‌ای یافت نشد. با دکمه + بالای پنجره کلمه جدید اضافه کنید.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .slice(0, 60)
      .map(
        (c) => `
          <div class="ca-word-item">
            <button type="button" class="ca-speak-btn" data-speak-word="${escapeHtml(c.word)}">🔊</button>
            <div class="ca-word-item-left">
              <div class="ca-word-item-en">${escapeHtml(c.word)}</div>
              <div class="ca-word-item-fa">${escapeHtml(c.translation || '')}</div>
            </div>
            <span class="ca-box-tag">B${Number(c.box || c.leitnerBox || 1)}</span>
            <button type="button" class="ca-btn-ghost" data-del-word="${escapeHtml(c.id || c.word)}" title="حذف">✕</button>
          </div>
        `
      )
      .join('');

    listEl.querySelectorAll('[data-speak-word]').forEach((btn) => {
      btn.addEventListener('click', () => speakText(btn.getAttribute('data-speak-word')));
    });

    listEl.querySelectorAll('[data-del-word]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del-word');
        await Database.deleteCard(id);
        await loadAllState();
      });
    });
  }

  function switchTab(tabName) {
    state.activeTab = tabName;
    document.querySelectorAll('.ca-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.ca-popup-view').forEach((view) => {
      view.classList.toggle('active', view.id === `popup-view-${tabName}`);
    });
  }

  function bindEvents() {
    document.querySelectorAll('.ca-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchTab(btn.getAttribute('data-tab'));
      });
    });

    document.getElementById('popup-cloud-btn')?.addEventListener('click', () => {
      switchTab(state.activeTab === 'cloud' ? 'review' : 'cloud');
    });

    const qaBox = document.getElementById('popup-quick-add-box');
    document.getElementById('popup-add-word-toggle')?.addEventListener('click', () => {
      qaBox?.classList.toggle('hidden');
    });
    document.getElementById('qa-cancel-btn')?.addEventListener('click', () => {
      qaBox?.classList.add('hidden');
    });
    document.getElementById('qa-save-btn')?.addEventListener('click', async () => {
      const wordEn = document.getElementById('qa-word-en')?.value?.trim();
      const wordFa = document.getElementById('qa-word-fa')?.value?.trim();
      const noteFa = document.getElementById('qa-word-note')?.value?.trim() || '';
      if (!wordEn || !wordFa) return;
      await Database.saveCard({
        id: wordEn.toLowerCase(),
        word: wordEn.toLowerCase(),
        translation: wordFa,
        customNotes: noteFa,
        status: 'learning',
        ankiState: 'new',
        intervalDays: 0,
        box: 1,
        leitnerBox: 1,
        nextReviewAt: Date.now() - 1000
      });
      document.getElementById('qa-word-en').value = '';
      document.getElementById('qa-word-fa').value = '';
      document.getElementById('qa-word-note').value = '';
      qaBox?.classList.add('hidden');
      state.selectedBoxFilter = 'due';
      await loadAllState();
    });

    document.getElementById('popup-word-search')?.addEventListener('input', (e) => {
      state.searchQuery = e.target.value || '';
      renderSavedWordsTab();
    });

    document.getElementById('popup-connect-token-btn')?.addEventListener('click', async () => {
      const raw = document.getElementById('popup-sync-token-input')?.value?.trim();
      const statusBox = document.getElementById('popup-cloud-status-box');
      if (!raw) return;
      try {
        if (statusBox) statusBox.textContent = 'در حال اتصال به اکانت جیمیل...';
        await Database.connectCloudSyncToken(raw);
        await loadAllState();
      } catch (err) {
        if (statusBox) statusBox.textContent = `خطا: ${err.message || err}`;
      }
    });

    document.getElementById('popup-sync-now-btn')?.addEventListener('click', async () => {
      const statusBox = document.getElementById('popup-cloud-status-box');
      try {
        if (statusBox) statusBox.textContent = 'در حال همگام‌سازی ابری...';
        await Database.syncWithCloudAccount();
        await loadAllState();
        if (statusBox) statusBox.textContent = '✓ همگام‌سازی ابری با موفقیت انجام شد!';
      } catch (err) {
        if (statusBox) statusBox.textContent = `خطا: ${err.message || err}`;
      }
    });

    document.getElementById('popup-save-site-url-btn')?.addEventListener('click', async () => {
      const val = document.getElementById('popup-site-url-input')?.value?.trim();
      if (val && /^https?:\/\//i.test(val)) {
        state.websiteUrl = val;
        await Database.saveSettings({ publicWebsiteUrl: val });
        updateFooterWebsiteLink();
      }
    });

    document.getElementById('popup-open-portal-btn')?.addEventListener('click', () => {
      if (ext && ext.runtime && ext.tabs) {
        const url = ext.runtime.getURL('src/dashboard/dashboard.html');
        ext.tabs.create({ url });
      } else {
        window.open('../dashboard/dashboard.html', '_blank');
      }
    });
  }

  bindEvents();
  loadAllState();
})();
