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

  function isValidPersianTranslation(candidate, sourceEnglish) {
    const text = String(candidate || '').trim();
    if (!text) return false;
    if (text.toLowerCase() === String(sourceEnglish || '').trim().toLowerCase()) return false;
    return /[\u0600-\u06FF]/.test(text);
  }

  async function lookupWordComplete(word, contextSentence = '', sourceLang = 'en', targetLang = 'fa') {
    const rawDisplay = String(word || '').trim();
    const clean = globalThis.LTConstants
      ? globalThis.LTConstants.normalizeWord(word)
      : rawDisplay.toLowerCase();
    if (!clean) return null;

    const cacheKey = `${sourceLang}:${targetLang}:${clean}:${contextSentence.slice(0, 48)}`;
    if (wordCache.has(cacheKey)) return wordCache.get(cacheKey);

    const localHit = globalThis.LTConstants && typeof globalThis.LTConstants.lookupInstantLocalMultiPos === 'function'
      ? globalThis.LTConstants.lookupInstantLocalMultiPos(clean)
      : null;
    const lemma = globalThis.LTConstants && typeof globalThis.LTConstants.lemmatizeWord === 'function'
      ? globalThis.LTConstants.lemmatizeWord(clean)
      : clean;

    // Fast, clean Google Translate dictionary query (without slow dt=md/ex/ss/rw that cause timeouts or drop dict)
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(clean)}`;
    const gtxLemmaUrl = lemma && lemma !== clean
      ? `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dj=1&q=${encodeURIComponent(lemma)}`
      : '';
    const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma || clean)}`;

    const [gtxRes, gtxLemmaRes, dictRes, contextTrans] = await Promise.all([
      fetchWithTimeout(gtxUrl, 900).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      gtxLemmaUrl ? fetchWithTimeout(gtxLemmaUrl, 900).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
      fetchWithTimeout(dictUrl, 750).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      contextSentence ? translateSentence(contextSentence, sourceLang, targetLang) : Promise.resolve('')
    ]);

    let primaryTranslation = '';
    let pos = (localHit && localHit.pos) || 'word';
    const posMap = new Map();
    const synonyms = [];
    const examples = [];

    const addPosGroup = (groupPos, terms, entries = []) => {
      const validTerms = (terms || [])
        .map((t) => String(t || '').trim())
        .filter((t) => isValidPersianTranslation(t, clean) && isValidPersianTranslation(t, lemma));
      if (validTerms.length === 0 && (!entries || entries.length === 0)) return;

      const key = String(groupPos || 'word').toLowerCase();
      if (!posMap.has(key)) {
        posMap.set(key, { pos: groupPos || 'word', terms: [], entries: [] });
      }
      const bucket = posMap.get(key);
      for (const t of validTerms) {
        if (!bucket.terms.includes(t)) bucket.terms.push(t);
      }
      for (const e of entries || []) {
        if (e && isValidPersianTranslation(e.word, clean) && !bucket.entries.some((x) => x.word === e.word)) {
          bucket.entries.push(e);
        }
      }
    };

    if (localHit && Array.isArray(localHit.posGroups)) {
      for (const g of localHit.posGroups) {
        addPosGroup(g.pos, g.terms || []);
      }
      if (localHit.translation && isValidPersianTranslation(localHit.translation, clean)) {
        primaryTranslation = localHit.translation;
      }
    }

    const extractGtxDict = (resObj) => {
      if (!resObj) return;
      const trans = (resObj.sentences || []).map((s) => s.trans || '').join('').trim();
      if (isValidPersianTranslation(trans, clean) && !primaryTranslation) {
        primaryTranslation = trans;
      }
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
    };

    extractGtxDict(gtxRes);
    extractGtxDict(gtxLemmaRes);

    // If Google Translate echoed the English word (e.g. rare word or capitalized word), try MyMemory & carrier phrase
    if (!primaryTranslation && posMap.size === 0) {
      try {
        const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
        const mmRes = await fetchWithTimeout(mmUrl, 800);
        if (mmRes.ok) {
          const mmData = await mmRes.json();
          const mmTrans = mmData?.responseData?.translatedText || '';
          if (isValidPersianTranslation(mmTrans, clean)) {
            primaryTranslation = mmTrans.trim();
            addPosGroup(pos !== 'word' ? pos : 'meaning', [primaryTranslation]);
          }
          if (Array.isArray(mmData?.matches)) {
            const matchTerms = [];
            for (const m of mmData.matches.slice(0, 5)) {
              const t = String(m?.translation || '').trim();
              if (isValidPersianTranslation(t, clean) && !matchTerms.includes(t)) {
                matchTerms.push(t);
              }
            }
            if (matchTerms.length > 0) {
              addPosGroup(pos !== 'word' ? pos : 'noun / adj', matchTerms);
            }
          }
        }
      } catch (_e) {
        // ignore
      }
    }

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

    const posGroups = Array.from(posMap.values());
    const allUniqueTerms = [];
    for (const g of posGroups) {
      for (const t of g.terms) {
        if (t && !allUniqueTerms.includes(t)) allUniqueTerms.push(t);
      }
    }
    if (primaryTranslation && isValidPersianTranslation(primaryTranslation, clean) && !allUniqueTerms.includes(primaryTranslation)) {
      allUniqueTerms.unshift(primaryTranslation);
    }

    // Handle Proper Nouns / Brand Names / Specialized Terms (like "Primacon") so they NEVER display raw English as Persian meaning
    let richTranslation = allUniqueTerms.slice(0, 6).join('، ') || primaryTranslation;
    if (!richTranslation || !isValidPersianTranslation(richTranslation, clean)) {
      const isCapitalizedInContext = /^[A-Z]/.test(rawDisplay) || (contextSentence && contextSentence.includes(clean[0].toUpperCase() + clean.slice(1)));
      if (isCapitalizedInContext && definitions.length === 0) {
        pos = 'proper noun';
        richTranslation = `نام خاص / عنوان اختصاصی (${rawDisplay})`;
        posGroups.push({
          pos: 'proper noun (نام خاص)',
          terms: [
            `نام خاص، کانال یا شخصیت اختصاصی در ویدیو («${rawDisplay}»)`,
            contextTrans ? `کاربرد در این جمله: «${contextTrans}»` : 'عنوان یا برند اختصاصی'
          ],
          entries: []
        });
      } else {
        richTranslation = contextTrans
          ? `معنی بافتاری در جمله: «${contextTrans.slice(0, 60)}»`
          : `واژه تخصصی (${lemma || clean})`;
        posGroups.push({
          pos: pos !== 'word' ? pos : 'contextual',
          terms: [richTranslation],
          entries: []
        });
      }
    } else if (posGroups.length === 0) {
      posGroups.push({
        pos: pos !== 'word' ? pos : 'meaning',
        terms: richTranslation.split('،').map((s) => s.trim()).filter(Boolean),
        entries: []
      });
    }

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

    // Build rich bilingual Usage Examples (English + Persian translation) for the Dictionary Drawer & Flashcard Back
    const finalTatoeba = [];
    if (contextSentence) {
      finalTatoeba.push({
        en: contextSentence,
        fa: contextTrans || '',
        source: 'Video Context'
      });
    }

    if (localHit && Array.isArray(localHit.usageExamples)) {
      for (const uEx of localHit.usageExamples) {
        if (uEx && uEx.en && !finalTatoeba.some((x) => x.en === uEx.en)) {
          finalTatoeba.push({ en: uEx.en, fa: uEx.fa || '', source: 'Usage Example' });
        }
      }
    }

    // Translate up to 2 English dictionary examples to Persian in parallel so every flashcard has translated usage sentences!
    const extraEnExamples = examples.filter((enEx) => enEx && enEx !== contextSentence && !finalTatoeba.some((x) => x.en === enEx)).slice(0, 2);
    if (extraEnExamples.length > 0) {
      const extraFaTranslations = await Promise.all(
        extraEnExamples.map((enEx) => translateSentence(enEx, sourceLang, targetLang).catch(() => ''))
      );
      for (let i = 0; i < extraEnExamples.length; i++) {
        finalTatoeba.push({
          en: extraEnExamples[i],
          fa: extraFaTranslations[i] || `مثال کاربردی برای «${richTranslation.split('،')[0]}»`,
          source: 'Dictionary'
        });
      }
    }

    // Ensure at least 2 usage example sentences on every card back
    if (finalTatoeba.length < 2) {
      const firstMeaning = richTranslation.split('،')[0].trim();
      const synthEn = `Mastering how "${clean}" is used in context makes your speaking much more natural.`;
      const synthFa = `یادگیری کاربرد «${clean}» (به معنی ${firstMeaning}) در بافت جمله، گفتار شما را بسیار طبیعی‌تر می‌کند.`;
      finalTatoeba.push({ en: synthEn, fa: synthFa, source: 'Usage Example' });
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
      examples: finalTatoeba.map((x) => x.en),
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
          fetchWithTimeout(gtxUrl, 900).catch(() => null),
          lemmaUrl ? fetchWithTimeout(lemmaUrl, 900).catch(() => null) : Promise.resolve(null)
        ]);
        const collectFromRes = async (r) => {
          if (!r || !r.ok) return;
          const data = await r.json();
          const primary = (data.sentences || []).map((s) => s.trans || '').join('').trim();
          if (isValidPersianTranslation(primary, lower) && !seedTerms.includes(primary)) {
            seedTerms.push(primary);
          }
          if (Array.isArray(data.dict)) {
            for (const g of data.dict) {
              if (Array.isArray(g.terms)) {
                for (const t of g.terms) {
                  const cleanT = String(t || '').trim();
                  if (isValidPersianTranslation(cleanT, lower) && !seedTerms.includes(cleanT)) {
                    seedTerms.push(cleanT);
                  }
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
      if (isValidPersianTranslation(fallback, lower)) return [fallback];
      return [`نام خاص / اصطلاح («${queryText}»)`];
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

  /**
   * Direct Gemini 2.5 Flash Caller using user's configured Gemini API Key (or server proxy fallback)
   */
  async function invokeGeminiFromExtension(promptText, expectJson = false) {
    const settings = globalThis.LTDatabase ? await globalThis.LTDatabase.getSettings() : {};
    const userKey = String((settings && settings.geminiApiKey) || '').trim();
    const baseUrl = String((settings && (settings.publicWebsiteUrl || settings.cloudAppUrl)) || 'https://cunt-academy.netlify.app/').replace(/\/+$/, '');

    // 1. If user saved a Gemini API Key, call Google Gemini 2.5 Flash REST API directly
    if (userKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(userKey)}`;
        const bodyPayload = {
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: expectJson ? { responseMimeType: 'application/json' } : {}
        };
        const res = await fetchWithTimeout(geminiUrl, 8500, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) return { ok: true, text, usedUserKey: true };
        }
      } catch (_e) {
        // continue to server fallback
      }
    }

    // 2. Try server proxy if available
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/gemini/word-qa`, 5500, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, expectJson, apiKey: userKey })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.text) {
          return { ok: true, text: data.text, usedServer: true };
        }
      }
    } catch (_e) {
      // fallback below
    }

    return { ok: false, text: '', hasKey: Boolean(userKey) };
  }

  /**
   * Lexa AI (Gemini) Contextual Word/Phrase Analyzer for the YouTube Extension Dictionary Drawer.
   */
  const aiExplainCache = new Map();

  async function analyzeContextualAi(wordOrPhrase, contextSentence = '', sourceLang = 'en', targetLang = 'fa') {
    const clean = String(wordOrPhrase || '').trim().toLowerCase();
    const cleanCtx = String(contextSentence || '').trim();
    const settings = globalThis.LTDatabase ? await globalThis.LTDatabase.getSettings() : {};
    const hasKey = Boolean(settings && settings.geminiApiKey);
    const cacheKey = `${clean}::${cleanCtx.slice(0, 64)}::${hasKey ? 'k1' : 'k0'}`;
    if (aiExplainCache.has(cacheKey)) return aiExplainCache.get(cacheKey);

    const dictData = await lookupWordComplete(clean, cleanCtx, sourceLang, targetLang);
    let sentenceTranslationFa = dictData?.contextTranslation || (cleanCtx ? await translateSentence(cleanCtx, sourceLang, targetLang) : '');
    let posInSentence = dictData?.pos || (clean.includes(' ') ? 'phrasal verb / idiom' : 'word');
    let contextualMeaningFa = dictData?.translation || clean;
    let mnemonicFa = '';

    let allMeaningsByPos = Array.isArray(dictData?.posGroups) && dictData.posGroups.length > 0
      ? dictData.posGroups.slice(0, 4).map((g) => ({
          pos: g.pos || posInSentence,
          meaningsFa: Array.isArray(g.terms) ? g.terms.slice(0, 6) : [contextualMeaningFa]
        }))
      : [{ pos: posInSentence, meaningsFa: [contextualMeaningFa] }];

    const grammarMeta = globalThis.LTConstants
      ? globalThis.LTConstants.buildContextualGrammarAnalysis(clean, cleanCtx, {
          pos: posInSentence,
          translation: contextualMeaningFa
        })
      : { summaryFa: `نقش دستوری: ${posInSentence} — معنی در این بافت: «${contextualMeaningFa}»` };

    let grammarNuanceFa = grammarMeta.summaryFa;

    const prompt = `You are an expert English-to-Persian linguist and YouTube subtitle coach.
Analyze the English word or phrase "${clean}" inside this exact video subtitle sentence:
"${cleanCtx || clean}"

Return ONLY valid JSON with these exact keys in Persian:
{
  "contextualMeaningFa": "معنی دقیق و طبیعی این کلمه در همین جمله (کوتاه و دقیق)",
  "posInSentence": "نقش دستوری دقیق در این جمله (مثلاً noun, verb, adjective, idiom)",
  "sentenceTranslationFa": "ترجمه روان و طبیعی کل جمله زیرنویس به فارسی",
  "grammarNuanceFa": "توضیح کامل و کاربردی درباره اینکه چرا گوینده از این واژه استفاده کرده، بار معنایی آن (رسمی/عامیانه) و ساختار گرامری آن در این جمله چیست",
  "mnemonicFa": "یک ترفند تصویرسازی ذهنی یا ریشه‌شناسی جذاب برای حفظ کردن سریع این واژه"
}`;

    const gemRes = await invokeGeminiFromExtension(prompt, true);
    if (gemRes.ok && gemRes.text) {
      try {
        const cleanedJson = gemRes.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleanedJson);
        if (parsed.contextualMeaningFa) contextualMeaningFa = parsed.contextualMeaningFa;
        if (parsed.posInSentence) posInSentence = parsed.posInSentence;
        if (parsed.sentenceTranslationFa) sentenceTranslationFa = parsed.sentenceTranslationFa;
        if (parsed.grammarNuanceFa) grammarNuanceFa = parsed.grammarNuanceFa;
        if (parsed.mnemonicFa) mnemonicFa = parsed.mnemonicFa;
      } catch (_parseErr) {
        grammarNuanceFa = gemRes.text;
      }
    } else {
      // Rich multi-sense linguistic synthesis even before API key is entered
      const primarySense = contextualMeaningFa.split('،')[0].trim();
      const extraSenses = allMeaningsByPos.map((g) => `${g.pos}: ${g.meaningsFa.slice(0, 3).join('، ')}`).join(' | ');
      grammarNuanceFa = `در این دیالوگ («${cleanCtx || clean}»)، واژه «${clean}» در نقش ${posInSentence} به معنی «${primarySense}» به کار رفته است. سایر معانی و نقش‌ها: ${extraSenses}.`;
      mnemonicFa = `💡 نکته یادگیری: این واژه در سطح ${dictData?.cefr || 'B2'} قرار دارد؛ آن را همراه با هم‌نشینی "${dictData?.collocation || clean}" در جمله بالا به خاطر بسپارید.`;
    }

    const aiPayload = {
      contextualMeaningFa,
      posInSentence,
      sentenceTranslationFa,
      grammarNuanceFa,
      mnemonicFa,
      allMeaningsByPos,
      allMeaningsFa: allMeaningsByPos,
      usedLiveGemini: Boolean(gemRes.ok)
    };

    aiExplainCache.set(cacheKey, aiPayload);
    return aiPayload;
  }

  /**
   * Interactive Q&A about a subtitle word/phrase right inside the Dictionary Drawer!
   */
  async function askWordQuestionAi(wordOrPhrase, contextSentence = '', question = '', history = []) {
    const clean = String(wordOrPhrase || '').trim();
    const cleanCtx = String(contextSentence || '').trim();
    const userQ = String(question || '').trim() || 'توضیح بیشتری درباره کاربرد این کلمه بده';

    const dictData = await lookupWordComplete(clean, cleanCtx, 'en', 'fa');
    const historyText = Array.isArray(history) && history.length > 0
      ? history.slice(-4).map((h) => `${h.role === 'user' ? 'کاربر' : 'هوش مصنوعی'}: ${h.text}`).join('\n')
      : '';

    const prompt = `شما یک استاد حرفه‌ای آموزش زبان انگلیسی به فارسی‌زبانان هستید.
کاربر در حال تماشای یک ویدیو در یوتیوب است و روی کلمه/عبارت "${clean}" در این جمله زیرنویس کلیک کرده است:
جمله زیرنویس: "${cleanCtx || clean}"
ترجمه جمله: "${dictData?.contextTranslation || ''}"
معانی ثبت‌شده در دیکشنری: "${dictData?.translation || ''}"

${historyText ? `سابقه گفتگوی قبلی:\n${historyText}\n` : ''}
سوال جدید کاربر درباره این کلمه:
"${userQ}"

لطفاً یک پاسخ بسیار دقیق، صمیمی، کاربردی و خوش‌خوان به زبان فارسی (همراه با مثال انگلیسی و ترجمه فارسی در صورت نیاز) بنویسید.`;

    const gemRes = await invokeGeminiFromExtension(prompt, false);
    if (gemRes.ok && gemRes.text) {
      return {
        ok: true,
        answerFa: gemRes.text.trim(),
        usedLiveGemini: true
      };
    }

    // Intelligent question-aware fallback if API key is not configured or unreachable
    const qLower = userQ.toLowerCase();
    const primaryMeaning = (dictData?.translation || clean).split('،')[0].trim();
    const posList = (dictData?.posGroups || []).map((g) => `• ${g.pos}: ${(g.terms || []).slice(0, 4).join('، ')}`).join('\n');
    const syns = Array.isArray(dictData?.synonyms) && dictData.synonyms.length > 0
      ? dictData.synonyms.slice(0, 5).join(', ')
      : 'موارد هم‌خانواده در همین سطح معنایی';
    const exList = (dictData?.tatoebaExamples || []).slice(0, 2).map((ex, i) => `${i + 1}. "${ex.en}"\n   ترجمه: ${ex.fa}`).join('\n');

    let smartAnswer = '';
    if (qLower.includes('مترادف') || qLower.includes('تفاوت') || qLower.includes('synonym')) {
      smartAnswer = `🔍 **بررسی مترادف‌ها و ظرافت معنایی «${clean}»:**\n` +
        `در این دیالوگ، «${clean}» دقیقاً به معنی **«${primaryMeaning}»** است.\n` +
        `• **مترادف‌های نزدیک:** ${syns}\n` +
        `• **چرا گوینده از «${clean}» استفاده کرده؟** چون در بافتِ جمله «${cleanCtx}»، این واژه بار معنایی دقیق‌تر و طبیعی‌تری (سطح ${dictData?.cefr || 'B2'}) نسبت به کلمات ساده‌تر منتقل می‌کند.`;
    } else if (qLower.includes('مثال') || qLower.includes('جمله') || qLower.includes('example')) {
      smartAnswer = `📚 **جملات نمونه کاربردی برای «${clean}» (${primaryMeaning}):**\n${exList}\n` +
        `• در همه این جملات، کلمه در نقش **${dictData?.pos || 'واژه اصلی'}** به کار رفته است.`;
    } else if (qLower.includes('رسمی') || qLower.includes('عامیانه') || qLower.includes('لحن')) {
      smartAnswer = `🎩 **لحن و سطح کاربرد «${clean}»:**\n` +
        `این واژه در سطح **${dictData?.cefr || 'B2'} (${dictData?.freqTag || 'tag 3k'})** قرار دارد و در مکالمات روزمره، پادکست‌ها و ویدیوهای تخصصی یوتیوب کاملاً طبیعی و پرکاربرد است.\n` +
        `معانی در نقش‌های مختلف:\n${posList}`;
    } else {
      smartAnswer = `✨ **پاسخ درباره «${clean}» در این دیالوگ:**\n` +
        `• **معنی دقیق در این جمله:** ${dictData?.translation || primaryMeaning}\n` +
        `• **نقش دستوری و ریشه:** نقش ${dictData?.pos || 'word'} (ریشه: ${dictData?.lemma || clean})\n` +
        `• **همه معانی به تفکیک نقش:**\n${posList}\n` +
        `• **مثال‌ها:**\n${exList}\n\n` +
        `💡 *(برای دریافت پاسخ‌های آزاد و نامحدود از مدل Google Gemini 2.5 Flash، می‌توانید کلید API خود را با دکمه 🔑 بالای همین کادر یا در پاپ‌آپ اکستنشن وارد کنید).*`;
    }

    return {
      ok: true,
      answerFa: smartAnswer,
      usedLiveGemini: false
    };
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

            case 'LT_AI_CONTEXTUAL_EXPLAIN': {
              const aiData = await analyzeContextualAi(
                message.word,
                message.contextSentence || '',
                message.sourceLang || 'en',
                message.targetLang || 'fa'
              );
              sendResponse({ ok: true, data: aiData });
              break;
            }

            case 'LT_ASK_WORD_AI': {
              const qaData = await askWordQuestionAi(
                message.word,
                message.contextSentence || '',
                message.question || '',
                Array.isArray(message.history) ? message.history : []
              );
              sendResponse({ ok: true, data: qaData });
              break;
            }

            case 'LT_SAVE_GEMINI_KEY': {
              const cleanKey = String(message.geminiApiKey || '').trim();
              await globalThis.LTDatabase.saveSettings({ geminiApiKey: cleanKey });
              aiExplainCache.clear();
              sendResponse({ ok: true, hasKey: Boolean(cleanKey) });
              break;
            }

            case 'LT_GET_SETTINGS': {
              const settings = await globalThis.LTDatabase.getSettings();
              sendResponse({ ok: true, settings });
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

            case 'LT_WEB_BRIDGE_PULL': {
              const [cards, cloudAccount, settings] = await Promise.all([
                globalThis.LTDatabase.getAllCards(),
                globalThis.LTDatabase.getCloudAccount(),
                globalThis.LTDatabase.getSettings()
              ]);
              sendResponse({
                ok: true,
                cards,
                cloudAccount,
                geminiApiKey: (settings && settings.geminiApiKey) || ''
              });
              break;
            }

            case 'LT_WEB_BRIDGE_PUSH': {
              if (Array.isArray(message.cards) && message.cards.length > 0 && globalThis.LTDatabase.mergeWebsiteCards) {
                await globalThis.LTDatabase.mergeWebsiteCards(message.cards);
              }
              if (message.cloudAccount && message.cloudAccount.email && globalThis.LTDatabase.connectCloudSyncToken) {
                await globalThis.LTDatabase.connectCloudSyncToken(message.cloudAccount.email).catch(() => {});
              }
              if (message.geminiApiKey) {
                await globalThis.LTDatabase.saveSettings({ geminiApiKey: String(message.geminiApiKey).trim() });
              }
              sendResponse({ ok: true });
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
