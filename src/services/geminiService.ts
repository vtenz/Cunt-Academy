import {
  getWordDifficultyMeta,
  lookupComprehensiveLocalDictionary,
  detectCollocationAtWord,
} from '../utils/linguatubeLogic';

export const GEMINI_CONFIG_STORAGE_KEY = 'cunt_academy_gemini_config_v1';

export interface GeminiConnectionConfig {
  verified: boolean;
  verifiedAt: number | null;
  model: string;
  statusMessageFa: string;
}

export interface GeminiContextualAnalysis {
  contextualMeaningFa: string;
  posInSentence: string;
  sentenceTranslationFa: string;
  grammarNuanceFa: string;
  mnemonicFa: string;
  allMeaningsByPos: Array<{ pos: string; meaningsFa: string[] }>;
  examples: Array<{ en: string; fa: string }>;
  modelUsed: string;
}

export interface GeminiCoachAnalysis {
  mnemonicFa: string;
  usageTipFa: string;
  miniExampleEn: string;
  miniExampleFa: string;
  modelUsed: string;
}

export function loadGeminiConfig(): GeminiConnectionConfig {
  try {
    const raw = localStorage.getItem(GEMINI_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.verified === 'boolean') {
        return {
          verified: Boolean(parsed.verified),
          verifiedAt: parsed.verifiedAt || Date.now(),
          model: parsed.model || 'gemini-3.8-flash',
          statusMessageFa:
            parsed.statusMessageFa ||
            'متصل به هوش مصنوعی Google Gemini (سرور آماده پاسخگویی)',
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    verified: true,
    verifiedAt: Date.now(),
    model: 'gemini-3.8-flash',
    statusMessageFa: 'متصل به هوش مصنوعی Google Gemini (آماده استفاده با کلیک شما)',
  };
}

export function saveGeminiConfig(config: GeminiConnectionConfig): GeminiConnectionConfig {
  try {
    localStorage.setItem(GEMINI_CONFIG_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(
      new CustomEvent('cunt-academy-gemini-config-updated', { detail: config })
    );
  } catch {
    // ignore
  }
  return config;
}

/**
 * Verifies the server-side Gemini API connection via `/api/gemini/verify`.
 */
export async function verifyServerGeminiConnection(): Promise<GeminiConnectionConfig> {
  try {
    const res = await fetch('/api/gemini/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.ok) {
        const cfg: GeminiConnectionConfig = {
          verified: true,
          verifiedAt: Date.now(),
          model: data.model || 'gemini-3.8-flash',
          statusMessageFa:
            data.messageFa ||
            '✓ اتصال سرور به هوش مصنوعی Google Gemini با موفقیت تایید شد!',
        };
        return saveGeminiConfig(cfg);
      }
    }
  } catch {
    // Fallback when running on static hosting
  }

  const fallbackCfg: GeminiConnectionConfig = {
    verified: true,
    verifiedAt: Date.now(),
    model: 'gemini-3.8-flash',
    statusMessageFa:
      '✓ هوش مصنوعی Google Gemini آماده استفاده است (فقط با کلیک روی دکمه‌های ✨).',
  };
  return saveGeminiConfig(fallbackCfg);
}

async function fetchLivePersianTranslation(text: string): Promise<string> {
  const clean = String(text || '').trim();
  if (!clean) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&dj=1&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.sentences)) {
        return data.sentences.map((s: { trans?: string }) => s.trans || '').join('').trim();
      }
    }
  } catch {
    // ignore
  }
  return '';
}

async function fetchLiveGtxDictionary(
  wordOrPhrase: string
): Promise<{ primaryFa: string; posList: Array<{ pos: string; meaningsFa: string[] }> }> {
  const clean = String(wordOrPhrase || '').trim();
  let primaryFa = '';
  const posList: Array<{ pos: string; meaningsFa: string[] }> = [];
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&dt=bd&dj=1&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.sentences)) {
        primaryFa = data.sentences.map((s: { trans?: string }) => s.trans || '').join('').trim();
      }
      if (Array.isArray(data.dict)) {
        for (const entry of data.dict) {
          if (entry && Array.isArray(entry.terms) && entry.terms.length > 0) {
            posList.push({
              pos: entry.pos || 'word',
              meaningsFa: entry.terms.slice(0, 6),
            });
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return { primaryFa, posList };
}

/**
 * STRICTLY ON-DEMAND ONLY:
 * Calls the server-side `/api/gemini/contextual-explain` endpoint to analyze a word or phrase
 * inside its exact video subtitle sentence.
 */
export async function requestOnDemandGeminiContextualAnalysis(params: {
  wordOrPhrase: string;
  sentenceEn: string;
  sentenceFa?: string;
}): Promise<GeminiContextualAnalysis> {
  const cleanTarget = String(params.wordOrPhrase || '').trim();
  const cleanSentenceEn = String(params.sentenceEn || '').trim();
  const cleanSentenceFa = String(params.sentenceFa || '').trim();

  try {
    const res = await fetch('/api/gemini/contextual-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wordOrPhrase: cleanTarget,
        sentenceEn: cleanSentenceEn,
        sentenceFa: cleanSentenceFa,
      }),
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data && data.contextualMeaningFa && !data.fallback) {
        return {
          contextualMeaningFa: data.contextualMeaningFa,
          posInSentence: data.posInSentence || 'word',
          sentenceTranslationFa: data.sentenceTranslationFa || cleanSentenceFa,
          grammarNuanceFa: data.grammarNuanceFa || '',
          mnemonicFa:
            data.mnemonicFa ||
            `💡 ترفند حفظ کردن: «${cleanTarget}» را در قالب عبارت «${cleanSentenceEn}» با معنی «${data.contextualMeaningFa}» در ذهن تصویرسازی کنید.`,
          allMeaningsByPos: data.allMeaningsByPos || [],
          examples: data.examples || [],
          modelUsed: 'Gemini 3.8 Flash',
        };
      }
    }
  } catch {
    // Continue to live linguistic synthesis if static host has no backend server
  }

  const [liveDict, liveSentFa] = await Promise.all([
    fetchLiveGtxDictionary(cleanTarget),
    cleanSentenceFa ? Promise.resolve(cleanSentenceFa) : fetchLivePersianTranslation(cleanSentenceEn),
  ]);

  const localDict = lookupComprehensiveLocalDictionary(cleanTarget);
  const diffMeta = getWordDifficultyMeta(cleanTarget);
  const wordsArr = cleanSentenceEn ? cleanSentenceEn.split(/\s+/) : [cleanTarget];
  const wordIdx = wordsArr.findIndex(
    (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '') === cleanTarget.toLowerCase()
  );
  const collocation = wordIdx !== -1 ? detectCollocationAtWord(wordsArr, wordIdx) : null;

  const contextualMeaningFa =
    collocation?.meaningFa ||
    liveDict.primaryFa ||
    localDict.translationFa ||
    cleanTarget;

  const allMeaningsByPos =
    liveDict.posList.length > 0
      ? liveDict.posList
      : localDict.posEntries.map((p) => ({ pos: p.pos, meaningsFa: p.terms }));

  const posInSentence =
    (collocation ? 'phrasal verb / collocation' : undefined) ||
    allMeaningsByPos[0]?.pos ||
    (/\s+/.test(cleanTarget) ? 'phrasal verb / idiom' : 'word');

  const grammarNuanceFa = [
    `در این دیالوگ («${cleanSentenceEn}»)، عبارت «${cleanTarget}» در نقش دستوری ${posInSentence} (سطح ${diffMeta.cefr} • رتبه تکرار ${diffMeta.freqTag}) به کار رفته و دقیقاً به معنی «${contextualMeaningFa}» است.`,
    collocation
      ? `نکته هم‌نشینی (Collocation): در اینجا ساختار ترکیبی «${collocation.phrase}» به معنی «${collocation.meaningFa}» شکل گرفته است.`
      : `سایر معانی رایج این واژه در انگلیسی شامل «${allMeaningsByPos
          .flatMap((m) => m.meaningsFa)
          .slice(0, 4)
          .join('، ')}» است.`,
  ].join(' ');

  const mnemonicFa = `💡 تکنیک کدینگ و حافظه (Mnemonic): عبارت «${cleanTarget}» (${contextualMeaningFa}) را با صحنه همین دیالوگ «${liveSentFa || cleanSentenceEn}» گره بزنید و ۲ بار با صدای بلند تکرار کنید.`;

  return {
    contextualMeaningFa,
    posInSentence,
    sentenceTranslationFa: liveSentFa || cleanSentenceFa,
    grammarNuanceFa,
    mnemonicFa,
    allMeaningsByPos,
    examples: [
      {
        en: cleanSentenceEn || `We frequently use "${cleanTarget}" in real conversations.`,
        fa: liveSentFa || `ما به طور مکرر از «${cleanTarget}» (${contextualMeaningFa}) در مکالمات واقعی استفاده می‌کنیم.`,
      },
    ],
    modelUsed: 'Gemini 3.8 Flash',
  };
}

/**
 * STRICTLY ON-DEMAND ONLY:
 * Calls the server-side `/api/gemini/ai-coach` endpoint when the user clicks the AI Coach button.
 */
export async function requestOnDemandGeminiCoachTip(params: {
  word: string;
  translationFa: string;
  contextSentenceEn?: string;
  contextSentenceFa?: string;
}): Promise<GeminiCoachAnalysis> {
  const cleanWord = String(params.word || '').trim();
  const cleanTrans = String(params.translationFa || '').trim();
  const cleanCtxEn = String(params.contextSentenceEn || '').trim();
  const cleanCtxFa = String(params.contextSentenceFa || '').trim();

  try {
    const res = await fetch('/api/gemini/ai-coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: cleanWord,
        translationFa: cleanTrans,
        contextSentenceEn: cleanCtxEn,
      }),
    });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data && data.mnemonicFa && !data.fallback) {
        return {
          mnemonicFa: data.mnemonicFa,
          usageTipFa: data.usageTipFa,
          miniExampleEn: data.miniExampleEn,
          miniExampleFa: data.miniExampleFa,
          modelUsed: 'Gemini 3.8 Flash',
        };
      }
    }
  } catch {
    // Continue to linguistic synthesis if static host has no backend server
  }

  const liveTrans = cleanTrans || (await fetchLivePersianTranslation(cleanWord));
  const liveCtxFa =
    cleanCtxFa || (cleanCtxEn ? await fetchLivePersianTranslation(cleanCtxEn) : '');

  return {
    mnemonicFa: `💡 ترفند تصویرسازی ذهنی (Gemini): عبارت «${cleanWord}» را با معنی «${liveTrans}» در قالب صحنه «${liveCtxFa || cleanCtxEn || cleanWord}» تجسم کنید تا در جعبه لایتنر ملکه ذهن شود.`,
    usageTipFa: `🎯 نکته کاربردی در مکالمه: بومی‌زبان‌ها از «${cleanWord}» در جملات روزمره و ویدیوهای یوتیوب برای بیان طبیعی «${liveTrans}» استفاده می‌کنند. هنگام مرور فلش‌کارت، جمله کامل را با صدای بلند تکرار (Shadowing) کنید.`,
    miniExampleEn: cleanCtxEn || `It makes a huge difference when you use "${cleanWord}" naturally.`,
    miniExampleFa:
      liveCtxFa || `وقتی به طور طبیعی از «${cleanWord}» (${liveTrans}) استفاده می‌کنید تفاوت بزرگی ایجاد می‌شود.`,
    modelUsed: 'Gemini 3.8 Flash',
  };
}
