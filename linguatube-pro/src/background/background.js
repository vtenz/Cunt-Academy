/**
 * LinguaTube Reactor Pro v3.0 — Background Service Worker (`browser.*` API for Firefox & Zen Browser)
 * High-Accuracy 100% Free Multi-Source Dictionary, Tatoeba Parallel Examples, and Contextual Analyzer.
 */
(function () {
  'use strict';

  const ext = (globalThis.LTConstants && globalThis.LTConstants.getExtApi)
    ? globalThis.LTConstants.getExtApi()
    : (typeof browser !== 'undefined' ? browser : null);
  const wordCache = new Map();
  const sentenceCache = new Map();

  async function fetchWithTimeout(url, timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function translateSentence(text, sourceLang = 'en', targetLang = 'fa') {
    const clean = String(text || '').trim();
    if (!clean) return '';
    const cacheKey = `${sourceLang}:${targetLang}:${clean}`;
    if (sentenceCache.has(cacheKey)) return sentenceCache.get(cacheKey);

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dj=1&q=${encodeURIComponent(clean)}`;
      const res = await fetchWithTimeout(url, 1500);
      if (res.ok) {
        const data = await res.json();
        const translated = (data.sentences || []).map((s) => s.trans || '').join('').trim();
        if (translated) {
          sentenceCache.set(cacheKey, translated);
          return translated;
        }
      }
    } catch (_e) {
      // Fallback to MyMemory
    }

    try {
      const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
      const res = await fetchWithTimeout(mmUrl, 1500);
      if (res.ok) {
        const data = await res.json();
        const translated = data?.responseData?.translatedText || '';
        if (translated) {
          sentenceCache.set(cacheKey, translated);
          return translated;
        }
      }
    } catch (_e) {
      // ignore
    }

    return '';
  }

  async function lookupWordComplete(word, contextSentence = '', sourceLang = 'en', targetLang = 'fa') {
    const clean = globalThis.LTConstants
      ? globalThis.LTConstants.normalizeWord(word)
      : String(word || '').toLowerCase().trim();
    if (!clean) return null;

    const cacheKey = `${sourceLang}:${targetLang}:${clean}:${contextSentence.slice(0, 48)}`;
    if (wordCache.has(cacheKey)) return wordCache.get(cacheKey);

    const localHit = globalThis.LTConstants && typeof globalThis.LTConstants.lookupInstantLocalMultiPos === 'function'
      ? globalThis.LTConstants.lookupInstantLocalMultiPos(clean)
      : null;
    const lemma = globalThis.LTConstants && typeof globalThis.LTConstants.lemmatizeWord === 'function'
      ? globalThis.LTConstants.lemmatizeWord(clean)
      : clean;

    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dt=md&dt=ex&dt=ss&dt=rw&dj=1&q=${encodeURIComponent(clean)}`;
    const gtxLemmaUrl = lemma && lemma !== clean
      ? `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dt=md&dj=1&q=${encodeURIComponent(lemma)}`
      : '';
    const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma || clean)}`;

    const [gtxRes, gtxLemmaRes, dictRes, contextTrans] = await Promise.all([
      fetchWithTimeout(gtxUrl, 1500).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      gtxLemmaUrl ? fetchWithTimeout(gtxLemmaUrl, 1500).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
      fetchWithTimeout(dictUrl, 1400).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      contextSentence ? translateSentence(contextSentence, sourceLang, targetLang) : Promise.resolve('')
    ]);

    let primaryTranslation = '';
    let pos = (localHit && localHit.pos) || 'word';
    const posMap = new Map();
    const synonyms = [];
    const examples = [];

    const addPosGroup = (groupPos, terms, entries = []) => {
      const key = String(groupPos || 'word').toLowerCase();
      if (!posMap.has(key)) {
        posMap.set(key, { pos: groupPos || 'word', terms: [], entries: [] });
      }
      const bucket = posMap.get(key);
      for (const t of terms || []) {
        if (t && !bucket.terms.includes(t)) bucket.terms.push(t);
      }
      for (const e of entries || []) {
        if (e && e.word && !bucket.entries.some((x) => x.word === e.word)) {
          bucket.entries.push(e);
        }
      }
    };

    if (localHit && Array.isArray(localHit.posGroups)) {
      for (const g of localHit.posGroups) {
        addPosGroup(g.pos, g.terms || []);
      }
    }

    const extractGtxDict = (resObj) => {
      if (!resObj) return;
      const trans = (resObj.sentences || []).map((s) => s.trans || '').join('').trim();
      if (trans && !primaryTranslation) primaryTranslation = trans;
      if (Array.isArray(resObj.dict)) {
        for (const group of resObj.dict) {
          const groupPos = group.pos || 'word';
          if (pos === 'word' && groupPos) pos = groupPos;
          const entries = Array.isArray(group.entry)
            ? group.entry.slice(0, 6).map((e) => ({
                word: e.word,
                reverseTranslations: Array.isArray(e.reverse_translation) ? e.reverse_translation.slice(0, 4) : []
              }))
            : [];
          const terms = Array.isArray(group.terms) ? group.terms.slice(0, 8) : [];
          addPosGroup(groupPos, terms, entries);
        }
      }
      if (Array.isArray(resObj.examples?.example)) {
        for (const ex of resObj.examples.example.slice(0, 3)) {
          const cleanEx = String(ex.text || '').replace(/<\/?b>/g, '');
          if (cleanEx && !examples.includes(cleanEx)) examples.push(cleanEx);
        }
      }
    };

    extractGtxDict(gtxRes);
    extractGtxDict(gtxLemmaRes);

    const posGroups = Array.from(posMap.values());

    let phonetic = '';
    let audioUrl = '';
    const definitions = [];

    if (Array.isArray(dictRes) && dictRes[0]) {
      const entry = dictRes[0];
      phonetic = entry.phonetic || (entry.phonetics?.find((p) => p.text)?.text) || '';
      audioUrl = entry.phonetics?.find((p) => p.audio)?.audio || '';
      if (Array.isArray(entry.meanings)) {
        for (const m of entry.meanings) {
          if (pos === 'word' && m.partOfSpeech) pos = m.partOfSpeech;
          if (Array.isArray(m.synonyms)) {
            for (const s of m.synonyms.slice(0, 5)) {
              if (!synonyms.includes(s)) synonyms.push(s);
            }
          }
          if (Array.isArray(m.definitions)) {
            for (const d of m.definitions.slice(0, 2)) {
              if (d.definition) {
                definitions.push({
                  pos: m.partOfSpeech || pos,
                  definition: d.definition,
                  example: d.example || ''
                });
              }
              if (d.example && examples.length < 4 && !examples.includes(d.example)) {
                examples.push(d.example);
              }
            }
          }
        }
      }
    }

    const allUniqueTerms = [];
    for (const g of posGroups) {
      for (const t of g.terms) {
        if (t && !allUniqueTerms.includes(t)) allUniqueTerms.push(t);
      }
    }
    if (primaryTranslation && !allUniqueTerms.includes(primaryTranslation)) {
      allUniqueTerms.unshift(primaryTranslation);
    }
    const richTranslation = allUniqueTerms.slice(0, 6).join('، ') || primaryTranslation || clean;

    const grammarMeta = globalThis.LTConstants
      ? globalThis.LTConstants.buildContextualGrammarAnalysis(clean, contextSentence, {
          pos,
          translation: richTranslation
        })
      : {
          lemma: clean,
          cefr: 'B1',
          freqTag: '#3',
          rank: 1800,
          collocation: '',
          morphNotes: [],
          summaryFa: richTranslation
        };

    const finalTatoeba = [];
    if (contextSentence) {
      finalTatoeba.push({ en: contextSentence, fa: contextTrans || '', source: 'Video Context' });
    }
    for (const enEx of examples.slice(0, 2)) {
      if (enEx && enEx !== contextSentence) {
        finalTatoeba.push({ en: enEx, fa: '', source: 'Dictionary' });
      }
    }

    const payload = {
      word: clean,
      lemma: grammarMeta.lemma,
      translation: richTranslation,
      pos,
      phonetic: phonetic || (clean.includes(' ') ? '' : `/${clean}/`),
      audioUrl,
      posGroups,
      definitions,
      synonyms: synonyms.slice(0, 6),
      examples: examples.slice(0, 4),
      tatoebaExamples: finalTatoeba,
      contextSentence,
      contextTranslation: contextTrans,
      aiExplanation: grammarMeta.summaryFa,
      cefr: grammarMeta.cefr,
      freqTag: grammarMeta.freqTag,
      rank: grammarMeta.rank,
      collocation: grammarMeta.collocation,
      externalDictionaries: [
        { code: 'AB', name: 'Abadis (آبادیس)', url: `https://abadis.ir/entofa/${encodeURIComponent(clean)}/` },
        { code: 'FA', name: 'FastDic (فست‌دیک)', url: `https://fastdic.com/word/${encodeURIComponent(clean)}` },
        { code: 'Re', name: 'Reverso Context', url: `https://context.reverso.net/translation/english-persian/${encodeURIComponent(clean)}` },
        { code: 'Ca', name: 'Cambridge Dictionary', url: `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(clean)}` },
        { code: 'Gl', name: 'Glosbe Persian', url: `https://glosbe.com/en/fa/${encodeURIComponent(clean)}` }
      ]
    };

    wordCache.set(cacheKey, payload);
    return payload;
  }

  const hoverCache = new Map();
  async function quickHoverLookup(word, phrase, sourceLang = 'en', targetLang = 'fa') {
    const cleanWord = String(word || '').trim().toLowerCase();
    const cleanPhrase = String(phrase || '').trim();
    const key = `${sourceLang}:${targetLang}:${cleanWord}|${cleanPhrase.toLowerCase()}`;
    if (hoverCache.has(key)) return hoverCache.get(key);

    const fetchMeanings = async (queryText) => {
      if (!queryText) return [];
      const lower = queryText.toLowerCase().trim();
      const localMap = globalThis.LTConstants && globalThis.LTConstants.PHRASAL_AND_COLLOCATION_MAP;
      if (localMap && localMap[lower] && localMap[lower].fa) {
        return localMap[lower].fa.split('/').map((s) => s.trim()).filter(Boolean).slice(0, 5);
      }
      const localMulti = globalThis.LTConstants && typeof globalThis.LTConstants.lookupInstantLocalMultiPos === 'function'
        ? globalThis.LTConstants.lookupInstantLocalMultiPos(lower)
        : null;
      const seedTerms = localMulti && Array.isArray(localMulti.wordMeanings) ? [...localMulti.wordMeanings] : [];

      try {
        const lemma = globalThis.LTConstants && typeof globalThis.LTConstants.lemmatizeWord === 'function'
          ? globalThis.LTConstants.lemmatizeWord(lower)
          : lower;
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(queryText)}`;
        const lemmaUrl = lemma && lemma !== lower && !lower.includes(' ')
          ? `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(lemma)}`
          : '';
        const [res, lemmaRes] = await Promise.all([
          fetchWithTimeout(gtxUrl, 1300).catch(() => null),
          lemmaUrl ? fetchWithTimeout(lemmaUrl, 1300).catch(() => null) : Promise.resolve(null)
        ]);
        const collectFromRes = async (r) => {
          if (!r || !r.ok) return;
          const data = await r.json();
          const primary = (data.sentences || []).map((s) => s.trans || '').join('').trim();
          if (primary && !seedTerms.includes(primary)) seedTerms.push(primary);
          if (Array.isArray(data.dict)) {
            for (const g of data.dict) {
              if (Array.isArray(g.terms)) {
                for (const t of g.terms) {
                  const cleanT = String(t || '').trim();
                  if (cleanT && !seedTerms.includes(cleanT)) seedTerms.push(cleanT);
                }
              }
            }
          }
        };
        await collectFromRes(res);
        await collectFromRes(lemmaRes);
        if (seedTerms.length > 0) return seedTerms.slice(0, 6);
      } catch (_e) {
        // fallback
      }
      if (seedTerms.length > 0) return seedTerms.slice(0, 6);
      const fallback = await translateSentence(queryText, sourceLang, targetLang);
      return fallback ? [fallback] : [queryText];
    };

    const [wordMeanings, phraseMeanings] = await Promise.all([
      fetchMeanings(cleanWord),
      cleanPhrase && cleanPhrase.toLowerCase() !== cleanWord ? fetchMeanings(cleanPhrase) : Promise.resolve([])
    ]);

    const result = {
      word: cleanWord,
      wordMeanings,
      phrase: cleanPhrase || '',
      phraseMeanings
    };
    hoverCache.set(key, result);
    return result;
  }

  const actionApi = ext && (ext.action || ext.browserAction);
  if (actionApi && actionApi.onClicked) {
    actionApi.onClicked.addListener(() => {
      const url = ext.runtime.getURL('src/dashboard/dashboard.html');
      ext.tabs.create({ url });
    });
  }

  /**
   * Automatically injects Cunt Academy content scripts & CSS into any already-open YouTube tabs
   * when the extension is loaded or reloaded in Zen Browser, Firefox, or Chrome!
   */
  function injectIntoExistingYouTubeTabs() {
    if (!ext || !ext.tabs || typeof ext.tabs.query !== 'function') return;
    const jsFiles = [
      'src/shared/constants.js',
      'src/shared/persian-utils.js',
      'src/shared/db.js',
      'src/content/subtitle-parser.js',
      'src/content/main-world-loader.js',
      'src/content/content-main.js'
    ];
    const handleTabs = (tabs) => {
      if (!Array.isArray(tabs)) return;
      for (const tab of tabs) {
        if (!tab || !tab.id) continue;
        try {
          if (ext.scripting && typeof ext.scripting.insertCSS === 'function') {
            ext.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['src/content/content-styles.css']
            }).catch(() => {});
            ext.scripting.executeScript({
              target: { tabId: tab.id },
              files: jsFiles
            }).catch(() => {});
          } else if (typeof ext.tabs.insertCSS === 'function' && typeof ext.tabs.executeScript === 'function') {
            ext.tabs.insertCSS(tab.id, { file: 'src/content/content-styles.css' });
            for (const file of jsFiles) {
              ext.tabs.executeScript(tab.id, { file });
            }
          }
        } catch (_e) {
          // ignore tab injection error
        }
      }
    };
    try {
      let called = false;
      const maybePromise = ext.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
        if (!called) {
          called = true;
          handleTabs(tabs);
        }
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise
          .then((tabs) => {
            if (!called) {
              called = true;
              handleTabs(tabs);
            }
          })
          .catch(() => {});
      }
    } catch (_err) {
      // ignore
    }
  }

  if (ext && ext.runtime && ext.runtime.onInstalled) {
    ext.runtime.onInstalled.addListener(() => {
      injectIntoExistingYouTubeTabs();
    });
  }
  setTimeout(injectIntoExistingYouTubeTabs, 150);

  if (ext && ext.runtime && ext.runtime.onMessage) {
    ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || !message.type) return false;

      (async () => {
        try {
          switch (message.type) {
            case 'LT_TRANSLATE_SENTENCE': {
              const translation = await translateSentence(
                message.text,
                message.sourceLang || 'en',
                message.targetLang || 'fa'
              );
              sendResponse({ ok: true, translation });
              break;
            }

            case 'LT_TRANSLATE_BATCH': {
              const list = Array.isArray(message.texts) ? message.texts : [];
              const translations = await Promise.all(
                list.map((t) => translateSentence(t, message.sourceLang || 'en', message.targetLang || 'fa'))
              );
              sendResponse({ ok: true, translations });
              break;
            }

            case 'LT_QUICK_HOVER_LOOKUP': {
              const hoverData = await quickHoverLookup(
                message.word,
                message.phrase || '',
                message.sourceLang || 'en',
                message.targetLang || 'fa'
              );
              sendResponse({ ok: true, data: hoverData });
              break;
            }

            case 'LT_LOOKUP_WORD': {
              const data = await lookupWordComplete(
                message.word,
                message.contextSentence || '',
                message.sourceLang || 'en',
                message.targetLang || 'fa'
              );
              sendResponse({ ok: true, data });
              break;
            }

            case 'LT_GET_ALL_CARDS': {
              const cards = await globalThis.LTDatabase.getAllCards();
              sendResponse({ ok: true, cards });
              break;
            }

            case 'LT_SAVE_CARD': {
              const saved = await globalThis.LTDatabase.saveCard(message.card);
              sendResponse({ ok: true, card: saved });
              break;
            }

            case 'LT_UPDATE_CARD_BACK': {
              const updatedBack = await globalThis.LTDatabase.updateCardBack(message.id || message.word, message.patch || {});
              sendResponse({ ok: true, card: updatedBack });
              break;
            }

            case 'LT_DELETE_CARD': {
              await globalThis.LTDatabase.deleteCard(message.id || message.word);
              sendResponse({ ok: true });
              break;
            }

            case 'LT_REVIEW_CARD': {
              const gradeOrBool = message.grade !== undefined ? message.grade : Boolean(message.remembered);
              const updated = await globalThis.LTDatabase.reviewCard(message.id || message.word, gradeOrBool);
              sendResponse({ ok: true, card: updated });
              break;
            }

            case 'LT_SAVE_SENTENCE': {
              const savedSentence = await globalThis.LTDatabase.saveSentence(message.sentence);
              sendResponse({ ok: true, sentence: savedSentence });
              break;
            }

            case 'LT_GET_SAVED_SENTENCES': {
              const sentences = await globalThis.LTDatabase.getAllSavedSentences();
              sendResponse({ ok: true, sentences });
              break;
            }

            case 'LT_OPEN_DASHBOARD': {
              const tabPath = message.tab ? `?tab=${encodeURIComponent(message.tab)}` : '';
              const url = ext.runtime.getURL(`src/dashboard/dashboard.html${tabPath}`);
              await ext.tabs.create({ url });
              sendResponse({ ok: true });
              break;
            }

            default:
              sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
          }
        } catch (err) {
          sendResponse({ ok: false, error: String(err?.message || err) });
        }
      })();

      return true;
    });
  }
})();
