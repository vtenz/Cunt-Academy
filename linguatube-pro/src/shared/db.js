/**
 * LinguaTube Reactor Pro v3.0 — Unified Storage & PhrasePump Spaced Repetition Database
 * Exclusively uses Mozilla Firefox / Zen Browser `browser.*` WebExtension namespace.
 */
(function (global) {
  'use strict';

  const ext = (global.LTConstants && global.LTConstants.getExtApi)
    ? global.LTConstants.getExtApi()
    : (typeof browser !== 'undefined' ? browser : null);
  const DB_NAME = 'LinguaTubeReactorDB_v3';
  const DB_VERSION = 3;
  const CARDS_KEY = 'lt_saved_cards_v3';
  const SENTENCES_KEY = 'lt_saved_sentences_v3';
  const REVIEW_LOG_KEY = 'lt_review_history_v3';
  const SETTINGS_KEY = 'lt_user_settings_v3';

  function openIDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('cards')) {
            db.createObjectStore('cards', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('sentences')) {
            db.createObjectStore('sentences', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_err) {
        resolve(null);
      }
    });
  }

  async function readStorageKey(key, fallback) {
    if (ext && ext.storage && ext.storage.local) {
      try {
        const res = await new Promise((resolve) => {
          let settled = false;
          const maybePromise = ext.storage.local.get(key, (items) => {
            if (!settled) {
              settled = true;
              resolve(items);
            }
          });
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then((items) => {
              if (!settled) {
                settled = true;
                resolve(items);
              }
            }).catch(() => {
              if (!settled) {
                settled = true;
                resolve(null);
              }
            });
          }
        });
        if (res && res[key] !== undefined) return res[key];
      } catch (_e) {
        // fallback to localStorage
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }
    } catch (_e) {
      return fallback;
    }
    return fallback;
  }

  async function writeStorageKey(key, value) {
    if (ext && ext.storage && ext.storage.local) {
      try {
        await new Promise((resolve) => {
          let settled = false;
          const maybePromise = ext.storage.local.set({ [key]: value }, () => {
            if (!settled) {
              settled = true;
              resolve(true);
            }
          });
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(() => {
              if (!settled) {
                settled = true;
                resolve(true);
              }
            }).catch(() => {
              if (!settled) {
                settled = true;
                resolve(false);
              }
            });
          }
        });
      } catch (_e) {
        // continue
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (_e) {
      // ignore quota error
    }
  }

  async function getSettings() {
    const defaults = global.LTConstants ? global.LTConstants.DEFAULT_SETTINGS : {};
    const stored = await readStorageKey(SETTINGS_KEY, {});
    return Object.assign({}, defaults, stored || {}, {
      wordColors: Object.assign({}, defaults.wordColors || {}, (stored && stored.wordColors) || {}),
      subtitlePosition: Object.assign({}, defaults.subtitlePosition || {}, (stored && stored.subtitlePosition) || {})
    });
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const updated = Object.assign({}, current, partial || {}, {
      wordColors: Object.assign({}, current.wordColors || {}, (partial && partial.wordColors) || {}),
      subtitlePosition: Object.assign({}, current.subtitlePosition || {}, (partial && partial.subtitlePosition) || {})
    });
    await writeStorageKey(SETTINGS_KEY, updated);
    return updated;
  }

  async function getAllCards() {
    const cardsMap = await readStorageKey(CARDS_KEY, {});
    const list = Object.values(cardsMap || {});
    return list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }

  async function getCardByWord(word) {
    const clean = global.LTConstants ? global.LTConstants.normalizeWord(word) : String(word || '').toLowerCase().trim();
    if (!clean) return null;
    const cardsMap = await readStorageKey(CARDS_KEY, {});
    return cardsMap[clean] || null;
  }

  async function saveCard(cardInput) {
    const now = Date.now();
    const cleanId = global.LTConstants
      ? global.LTConstants.normalizeWord(cardInput.id || cardInput.word)
      : String(cardInput.id || cardInput.word || '').toLowerCase().trim();
    if (!cleanId) throw new Error('Invalid word ID');

    const cardsMap = await readStorageKey(CARDS_KEY, {});
    const existing = cardsMap[cleanId] || {};
    const meta = global.LTConstants
      ? global.LTConstants.getWordDifficultyMeta(cleanId)
      : { rank: 1500, cefr: 'B1', freqTag: '#3' };

    const status = cardInput.status || existing.status || 'learning';
    let leitnerBox = Number(cardInput.leitnerBox ?? cardInput.box ?? existing.leitnerBox ?? 1);
    if (status === 'known') leitnerBox = 5;
    if (status === 'ignored') leitnerBox = 0;

    const pumpStage = status === 'known' || leitnerBox >= 5
      ? 'learned'
      : status === 'ignored'
        ? 'ignored'
        : leitnerBox >= 2
          ? 'learning_now'
          : 'marked';

    const nextReviewAt = cardInput.nextReviewAt !== undefined
      ? cardInput.nextReviewAt
      : status === 'known'
        ? now + 16 * 86400000
        : status === 'ignored'
          ? now + 365 * 86400000
          : existing.nextReviewAt || now;

    const record = {
      id: cleanId,
      word: cardInput.word || existing.word || cleanId,
      lemma: cardInput.lemma || existing.lemma || (global.LTConstants ? global.LTConstants.lemmatizeWord(cleanId) : cleanId),
      translation: cardInput.translation || existing.translation || '',
      customNotes: cardInput.customNotes !== undefined ? cardInput.customNotes : (existing.customNotes || ''),
      pos: cardInput.pos || existing.pos || 'word',
      phonetic: cardInput.phonetic || existing.phonetic || '',
      definitions: cardInput.definitions || existing.definitions || [],
      synonyms: cardInput.synonyms || existing.synonyms || [],
      examples: cardInput.examples || existing.examples || [],
      tatoebaExamples: cardInput.tatoebaExamples || existing.tatoebaExamples || [],
      contextSentence: cardInput.contextSentence || existing.contextSentence || '',
      contextTranslation: cardInput.contextTranslation || existing.contextTranslation || '',
      aiExplanation: cardInput.aiExplanation || existing.aiExplanation || '',
      videoId: cardInput.videoId || existing.videoId || '',
      videoTitle: cardInput.videoTitle || existing.videoTitle || 'YouTube Video',
      timestamp: Number(cardInput.timestamp ?? existing.timestamp ?? 0),
      cefr: cardInput.cefr || existing.cefr || meta.cefr,
      freqTag: cardInput.freqTag || existing.freqTag || meta.freqTag,
      rank: Number(cardInput.rank ?? existing.rank ?? meta.rank),
      type: cardInput.type || existing.type || (String(cardInput.word || '').trim().includes(' ') ? 'phrase' : 'word'),
      status,
      pumpStage,
      ankiState: cardInput.ankiState || existing.ankiState || (status === 'known' ? 'review' : 'new'),
      intervalDays: Number(cardInput.intervalDays ?? existing.intervalDays ?? 0),
      easeFactor: Number(cardInput.easeFactor ?? existing.easeFactor ?? 2.5),
      box: leitnerBox,
      leitnerBox,
      reviewCount: Number(cardInput.reviewCount ?? existing.reviewCount ?? 0),
      lapseCount: Number(cardInput.lapseCount ?? existing.lapseCount ?? 0),
      correctCount: Number(cardInput.correctCount ?? existing.correctCount ?? 0),
      wrongCount: Number(cardInput.wrongCount ?? existing.wrongCount ?? 0),
      createdAt: existing.createdAt || now,
      updatedAt: now,
      lastReviewedAt: cardInput.lastReviewedAt || existing.lastReviewedAt || null,
      nextReviewAt
    };

    cardsMap[cleanId] = record;
    await writeStorageKey(CARDS_KEY, cardsMap);

    const db = await openIDB();
    if (db) {
      try {
        const tx = db.transaction('cards', 'readwrite');
        tx.objectStore('cards').put(record);
      } catch (_e) {
        // ignore
      }
    }

    pushCardToCloud(record).catch(() => {});
    return record;
  }

  async function updateCardBack(idOrWord, patch) {
    const card = await getCardByWord(idOrWord);
    if (!card) return null;
    return saveCard(Object.assign({}, card, {
      translation: patch && patch.translation !== undefined ? String(patch.translation).trim() : card.translation,
      customNotes: patch && patch.customNotes !== undefined ? String(patch.customNotes).trim() : (card.customNotes || ''),
      contextTranslation: patch && patch.contextTranslation !== undefined ? String(patch.contextTranslation).trim() : card.contextTranslation
    }));
  }

  async function deleteCard(idOrWord) {
    const cleanId = global.LTConstants
      ? global.LTConstants.normalizeWord(idOrWord)
      : String(idOrWord || '').toLowerCase().trim();
    const cardsMap = await readStorageKey(CARDS_KEY, {});
    delete cardsMap[cleanId];
    await writeStorageKey(CARDS_KEY, cardsMap);

    const db = await openIDB();
    if (db) {
      try {
        const tx = db.transaction('cards', 'readwrite');
        tx.objectStore('cards').delete(cleanId);
      } catch (_e) {
        // ignore
      }
    }
    return true;
  }

  async function reviewCard(idOrWord, gradeOrRemembered) {
    const card = await getCardByWord(idOrWord);
    if (!card) return null;

    const now = Date.now();
    let ankiGrade = 'good';
    if (gradeOrRemembered === 'again' || gradeOrRemembered === 'hard' || gradeOrRemembered === 'good' || gradeOrRemembered === 'easy') {
      ankiGrade = gradeOrRemembered;
    } else {
      ankiGrade = gradeOrRemembered ? 'good' : 'again';
    }

    const graded = global.LTConstants && typeof global.LTConstants.gradeAnkiCard === 'function'
      ? global.LTConstants.gradeAnkiCard(card, ankiGrade, now)
      : global.LTConstants
        ? global.LTConstants.gradeLeitnerCard(card, ankiGrade === 'again' ? 'wrong' : 'correct', now)
        : card;

    const isPass = ankiGrade !== 'again';
    const updated = await saveCard(Object.assign({}, card, graded, {
      correctCount: (card.correctCount || 0) + (isPass ? 1 : 0),
      wrongCount: (card.wrongCount || 0) + (isPass ? 0 : 1)
    }));

    const dateKey = new Date(now).toISOString().slice(0, 10);
    const logs = await readStorageKey(REVIEW_LOG_KEY, {});
    logs[dateKey] = (logs[dateKey] || 0) + 1;
    await writeStorageKey(REVIEW_LOG_KEY, logs);

    return updated;
  }

  async function getDueCards(now = Date.now()) {
    const all = await getAllCards();
    return all
      .filter((c) => c.status !== 'ignored' && (c.nextReviewAt || 0) <= now)
      .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
  }

  async function getReviewHistory() {
    return readStorageKey(REVIEW_LOG_KEY, {});
  }

  async function saveSentence(sentenceInput) {
    const now = Date.now();
    const id = sentenceInput.id || `sent_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      text: sentenceInput.text || '',
      translation: sentenceInput.translation || '',
      videoId: sentenceInput.videoId || '',
      videoTitle: sentenceInput.videoTitle || 'YouTube Video',
      timestamp: Number(sentenceInput.timestamp || 0),
      createdAt: sentenceInput.createdAt || now
    };
    const sentencesMap = await readStorageKey(SENTENCES_KEY, {});
    sentencesMap[id] = record;
    await writeStorageKey(SENTENCES_KEY, sentencesMap);
    return record;
  }

  async function getAllSavedSentences() {
    const sentencesMap = await readStorageKey(SENTENCES_KEY, {});
    return Object.values(sentencesMap || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const getSavedSentences = getAllSavedSentences;

  async function deleteSavedSentence(id) {
    const sentencesMap = await readStorageKey(SENTENCES_KEY, {});
    delete sentencesMap[id];
    await writeStorageKey(SENTENCES_KEY, sentencesMap);
    return true;
  }

  async function exportAllData() {
    const [cards, sentences, settings, reviewHistory] = await Promise.all([
      getAllCards(),
      getAllSavedSentences(),
      getSettings(),
      getReviewHistory()
    ]);
    return {
      version: '4.6.0',
      exportedAt: new Date().toISOString(),
      cards,
      sentences,
      settings,
      reviewHistory
    };
  }

  async function importAllData(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid backup JSON');
    if (Array.isArray(payload.cards)) {
      const map = {};
      for (const c of payload.cards) {
        const k = global.LTConstants ? global.LTConstants.normalizeWord(c.id || c.word) : String(c.id || c.word).toLowerCase();
        if (k) map[k] = c;
      }
      await writeStorageKey(CARDS_KEY, map);
    }
    if (Array.isArray(payload.sentences)) {
      const sMap = {};
      for (const s of payload.sentences) {
        if (s && s.id) sMap[s.id] = s;
      }
      await writeStorageKey(SENTENCES_KEY, sMap);
    }
    if (payload.settings) {
      await saveSettings(payload.settings);
    }
    return true;
  }

  // ============================================================================
  // CLOUD SYNC WITH GOOGLE / GMAIL ACCOUNT (Firebase Auth + Firestore REST API)
  // ============================================================================
  const CLOUD_ACCOUNT_KEY = 'lt_cloud_account_v1';

  async function getCloudAccount() {
    return readStorageKey(CLOUD_ACCOUNT_KEY, null);
  }

  async function disconnectCloudAccount() {
    await writeStorageKey(CLOUD_ACCOUNT_KEY, null);
    return true;
  }

  async function fetchFreshIdToken(account) {
    if (!account || !account.rt || !account.apiKey) return null;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(account.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(account.rt)}`
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id_token || null;
  }

  function sanitizeCloudId(raw) {
    const cleaned = String(raw || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
    return cleaned || `word_${Date.now()}`;
  }

  async function pushCardToCloud(card) {
    const account = await getCloudAccount();
    if (!account || !account.uid) return false;
    const idToken = await fetchFreshIdToken(account);
    if (!idToken) return false;

    const uid = sanitizeCloudId(account.uid);
    const cardId = sanitizeCloudId(`word_${String(card.word || card.id).toLowerCase().replace(/[^a-z0-9]/gi, '_')}`);
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/databases/${encodeURIComponent(account.dbId)}/documents`;
    const docUrl = `${baseUrl}/userProfiles/${encodeURIComponent(uid)}/cards/${encodeURIComponent(cardId)}`;

    const existingCheck = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    const nowIso = new Date().toISOString();
    let createdAtIso = nowIso;
    if (existingCheck.ok) {
      const existingDoc = await existingCheck.json();
      if (existingDoc?.fields?.createdAt?.timestampValue) {
        createdAtIso = existingDoc.fields.createdAt.timestampValue;
      }
    }

    const status = card.status === 'known' || card.status === 'ignored' ? card.status : 'learning';
    const pumpStage = status === 'known' ? 'learned' : status === 'ignored' ? 'ignored' : 'marked';
    const ankiState = card.ankiState === 'learning' || card.ankiState === 'review' || card.ankiState === 'relearning'
      ? card.ankiState
      : (status === 'known' ? 'review' : 'new');

    const body = {
      fields: {
        id: { stringValue: cardId },
        ownerId: { stringValue: uid },
        word: { stringValue: String(card.word || card.id || 'word').slice(0, 120) },
        lemma: { stringValue: String(card.lemma || card.word || 'word').slice(0, 120) },
        isPhrase: { booleanValue: Boolean(String(card.word || '').includes(' ')) },
        status: { stringValue: status },
        pumpStage: { stringValue: pumpStage },
        ankiState: { stringValue: ankiState },
        intervalDays: { integerValue: String(Math.max(0, Math.round(Number(card.intervalDays || 0)))) },
        learningStep: { integerValue: '0' },
        customNotesFa: { stringValue: String(card.customNotes || '').slice(0, 1000) },
        cefr: { stringValue: String(card.cefr || 'B1').slice(0, 10) },
        freqTag: { stringValue: String(card.freqTag || 'tag 2k').slice(0, 32) },
        rank: { integerValue: String(Math.max(0, Math.round(Number(card.rank || 1800)))) },
        phonetic: { stringValue: String(card.phonetic || '').slice(0, 120) },
        translationFa: { stringValue: String(card.translation || card.word || 'ترجمه').slice(0, 500) },
        miniMeaningsFa: { arrayValue: { values: [] } },
        aiExplanationFa: { stringValue: String(card.aiExplanation || '').slice(0, 2000) },
        englishDefinition: { stringValue: '' },
        contextSentenceEn: { stringValue: String(card.contextSentence || '').slice(0, 1000) },
        contextSentenceFa: { stringValue: String(card.contextTranslation || '').slice(0, 1000) },
        videoId: { stringValue: String(card.videoId || 'youtube-video').slice(0, 64) },
        videoTitle: { stringValue: String(card.videoTitle || 'YouTube Video').slice(0, 300) },
        videoTimestampSec: { integerValue: String(Math.max(0, Math.round(Number(card.timestamp || 0)))) },
        box: { integerValue: String(Math.min(6, Math.max(1, Math.round(Number(card.box || card.leitnerBox || 1))))) },
        nextReviewAt: { integerValue: String(Math.max(0, Math.round(Number(card.nextReviewAt || Date.now())))) },
        lastReviewedAt: { integerValue: String(Math.max(0, Math.round(Number(card.lastReviewedAt || Date.now())))) },
        reviewCount: { integerValue: String(Math.max(0, Math.round(Number(card.reviewCount || 0)))) },
        lapseCount: { integerValue: String(Math.max(0, Math.round(Number(card.lapseCount || 0)))) },
        easeFactor: { doubleValue: Number(card.easeFactor || 2.5) },
        createdAt: { timestampValue: createdAtIso },
        updatedAt: { timestampValue: nowIso }
      }
    };

    const writeRes = await fetch(docUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return writeRes.ok;
  }

  async function syncWithCloudAccount() {
    const account = await getCloudAccount();
    if (!account || !account.uid) throw new Error('اکانت جیمیل متصل نیست');
    const idToken = await fetchFreshIdToken(account);
    if (!idToken) throw new Error('توکن اتصال منقضی شده؛ لطفاً کد جدید را از سایت کپی کنید');

    const uid = sanitizeCloudId(account.uid);
    const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(account.projectId)}/databases/${encodeURIComponent(account.dbId)}/documents`;
    const listUrl = `${baseUrl}/userProfiles/${encodeURIComponent(uid)}/cards?pageSize=250`;

    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      const docs = Array.isArray(data.documents) ? data.documents : [];
      const cardsMap = await readStorageKey(CARDS_KEY, {});
      for (const docItem of docs) {
        const f = docItem.fields || {};
        const word = f.word?.stringValue || '';
        const clean = global.LTConstants ? global.LTConstants.normalizeWord(word) : word.toLowerCase().trim();
        if (!clean) continue;
        cardsMap[clean] = {
          id: clean,
          word,
          lemma: f.lemma?.stringValue || clean,
          translation: f.translationFa?.stringValue || '',
          customNotes: f.customNotesFa?.stringValue || '',
          phonetic: f.phonetic?.stringValue || '',
          contextSentence: f.contextSentenceEn?.stringValue || '',
          contextTranslation: f.contextSentenceFa?.stringValue || '',
          aiExplanation: f.aiExplanationFa?.stringValue || '',
          videoId: f.videoId?.stringValue || '',
          videoTitle: f.videoTitle?.stringValue || 'YouTube Video',
          cefr: f.cefr?.stringValue || 'B1',
          freqTag: f.freqTag?.stringValue || 'tag 2k',
          rank: Number(f.rank?.integerValue || 1800),
          status: f.status?.stringValue || 'learning',
          pumpStage: f.pumpStage?.stringValue || 'marked',
          ankiState: f.ankiState?.stringValue || 'new',
          intervalDays: Number(f.intervalDays?.integerValue || 0),
          easeFactor: Number(f.easeFactor?.doubleValue || f.easeFactor?.integerValue || 2.5),
          box: Number(f.box?.integerValue || 1),
          leitnerBox: Number(f.box?.integerValue || 1),
          reviewCount: Number(f.reviewCount?.integerValue || 0),
          lapseCount: Number(f.lapseCount?.integerValue || 0),
          nextReviewAt: Number(f.nextReviewAt?.integerValue || Date.now()),
          lastReviewedAt: Number(f.lastReviewedAt?.integerValue || Date.now()),
          updatedAt: Date.now()
        };
      }
      await writeStorageKey(CARDS_KEY, cardsMap);
    }

    const localCards = await getAllCards();
    for (const c of localCards.slice(0, 60)) {
      await pushCardToCloud(c).catch(() => {});
    }
    return true;
  }

  async function connectCloudSyncToken(rawToken) {
    const clean = String(rawToken || '').trim();
    if (!clean) throw new Error('کد اتصال خالی است');
    let parsed = null;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(clean)));
    } catch (_e) {
      throw new Error('فرمت کد اتصال معتبر نیست');
    }
    if (!parsed || !parsed.uid || !parsed.rt || !parsed.apiKey) {
      throw new Error('کد اتصال ناقص است');
    }
    await writeStorageKey(CLOUD_ACCOUNT_KEY, parsed);
    await syncWithCloudAccount();
    return parsed;
  }

  global.LTDatabase = {
    getSettings,
    saveSettings,
    getAllCards,
    getCardByWord,
    saveCard,
    updateCardBack,
    deleteCard,
    reviewCard,
    getDueCards,
    getReviewHistory,
    saveSentence,
    getAllSavedSentences,
    getSavedSentences,
    deleteSavedSentence,
    exportAllData,
    importAllData,
    getCloudAccount,
    connectCloudSyncToken,
    disconnectCloudAccount,
    syncWithCloudAccount
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
