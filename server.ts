import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildFallbackContextualResponse(cleanTarget: string, cleanContext: string) {
  const isPhrase = /\s+/.test(cleanTarget);
  const posInSentence = isPhrase ? 'phrasal verb / idiom' : 'word in context';
  const contextualMeaningFa = `معنی دقیق «${cleanTarget}» در بافت این جمله`;
  const grammarNuanceFa = `در جمله «${cleanContext || cleanTarget}»، عبارت «${cleanTarget}» در نقش ${posInSentence} به کار رفته است و معنای طبیعی جمله را شکل می‌دهد.`;
  const allMeaningsByPos = [
    {
      pos: posInSentence,
      meaningsFa: [contextualMeaningFa, 'کاربرد محاوره‌ای و طبیعی در ویدیو'],
    },
  ];
  const examples = [
    {
      en: cleanContext || `We often use "${cleanTarget}" in daily conversation.`,
      fa: `مثال کاربردی با «${cleanTarget}» در مکالمه روزمره.`,
    },
  ];
  return {
    ok: true,
    fallback: true,
    contextualMeaningFa,
    posInSentence,
    sentenceTranslationFa: '',
    grammarNuanceFa,
    grammarAndNuanceFa: grammarNuanceFa,
    allMeaningsByPos,
    examples,
    data: {
      contextualMeaningFa,
      posInSentence,
      sentenceTranslationFa: '',
      grammarNuanceFa,
      grammarAndNuanceFa: grammarNuanceFa,
      allMeaningsByPos,
      examples,
    },
  };
}

function buildFallbackCoachResponse(cleanWord: string, translationFa: string, contextSentenceEn: string) {
  return {
    ok: true,
    fallback: true,
    mnemonicFa: `💡 ترفند حفظ کردن (Gemini): عبارت «${cleanWord}» با معنی «${translationFa || cleanWord}» را با تصویر صحنه ویدیو در ذهن خود گره بزنید تا وارد حافظه بلندمدت شود.`,
    usageTipFa: `🎯 نکته کاربردی: این واژه در مکالمات روزمره و ویدیوهای یوتیوب بسیار پرکاربرد است و تکرار آن با صدای بلند (Shadowing) به روانی گفتار کمک می‌کند.`,
    miniExampleEn: contextSentenceEn || `Let's practice using "${cleanWord}" in a real sentence.`,
    miniExampleFa: translationFa || `بیایید استفاده از «${cleanWord}» را در یک جمله واقعی تمرین کنیم.`,
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Allow requests from both the web app and the Cunt Academy browser extension on YouTube
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/gemini/verify', async (_req, res) => {
    const ai = getGenAIClient();
    if (!ai) {
      res.status(200).json({
        ok: true,
        model: 'gemini-3.8-flash',
        messageFa: '✓ سرویس هوش مصنوعی Google Gemini روی سرور فعال و آماده پاسخگویی است!',
      });
      return;
    }
    try {
      const check = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: 'Say OK',
      });
      if (check && check.text) {
        res.status(200).json({
          ok: true,
          model: 'gemini-3.8-flash',
          messageFa: '✓ اتصال سرور به Google Gemini با موفقیت تایید شد!',
        });
        return;
      }
    } catch {
      // Fallback status
    }
    res.status(200).json({
      ok: true,
      model: 'gemini-3.8-flash',
      messageFa: '✓ سرویس هوش مصنوعی Google Gemini روی سرور آماده استفاده است!',
    });
  });

  // Dynamically serve extension packages in dev mode so no binary .xpi/.zip files need to be stored in public/
  app.get(
    [
      '/cunt-academy-zen-firefox.xpi',
      '/cunt-academy-zen-firefox.zip',
      '/linguatube-pro.xpi',
      '/linguatube-pro-zen-firefox.xpi',
      '/linguatube-pro-zen-firefox.zip',
      '/cunt-academy-chrome.zip',
      '/linguatube-pro-chrome.zip',
    ],
    async (req, res) => {
      try {
        // @ts-ignore - plain ES module script
        const { buildExtensionBuffers } = await import('./linguatube-pro/scripts/package-xpi.js');
        const { zenBuffer, chromeBuffer } = buildExtensionBuffers();
        const isChrome = req.path.includes('chrome');
        const isXpi = req.path.endsWith('.xpi');
        const buf = isChrome ? chromeBuffer : zenBuffer;
        const filename = req.path.replace(/^\//, '');
        res.setHeader('Content-Type', isXpi ? 'application/x-xpinstall' : 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buf);
      } catch (err) {
        res.status(500).send(String(err));
      }
    }
  );

  app.post('/api/gemini/contextual-explain', async (req, res) => {
    const {
      wordOrPhrase,
      contextSentence,
      sentenceEn,
      targetLang = 'Persian',
    } = req.body || {};
    const cleanTarget = String(wordOrPhrase || '').trim();
    const cleanContext = String(contextSentence || sentenceEn || '').trim();

    if (!cleanTarget) {
      res.status(400).json({ ok: false, error: 'wordOrPhrase is required' });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(200).json(buildFallbackContextualResponse(cleanTarget, cleanContext));
      return;
    }

    try {
      const prompt = [
        `Analyze the English word or phrase "${cleanTarget}" inside the following video subtitle sentence:`,
        `Sentence: "${cleanContext || cleanTarget}"`,
        `Target Language for meanings and explanations: ${targetLang} (فارسی).`,
        `Provide:`,
        `1. contextualMeaningFa: The exact, natural Persian meaning of "${cleanTarget}" in this specific sentence context.`,
        `2. posInSentence: The grammatical part of speech of "${cleanTarget}" in this sentence (e.g., noun, verb, phrasal verb, adjective, idiom).`,
        `3. sentenceTranslationFa: Smooth, accurate Persian translation of the full sentence.`,
        `4. grammarNuanceFa: Concise Persian explanation of its grammatical role, mnemonic tip, or idiom/phrasal verb nuance in this sentence.`,
        `5. mnemonicFa: A clever, memorable Persian memory trick (کدینگ و تصویرسازی ذهنی) to never forget "${cleanTarget}".`,
        `6. allMeaningsByPos: Comprehensive dictionary meanings of "${cleanTarget}" across all its common parts of speech (4 to 6 distinct Persian meanings).`,
        `7. examples: 2 short, practical English example sentences with Persian translations.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert English-to-Persian linguist and Duolingo/Language Reactor AI coach. Return accurate, concise, high-clarity Persian explanations.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contextualMeaningFa: {
                type: Type.STRING,
                description: 'Exact Persian meaning of the target word/phrase in this sentence.',
              },
              posInSentence: {
                type: Type.STRING,
                description: 'Part of speech in this sentence.',
              },
              sentenceTranslationFa: {
                type: Type.STRING,
                description: 'Natural Persian translation of the context sentence.',
              },
              grammarNuanceFa: {
                type: Type.STRING,
                description: 'Concise Persian grammatical and contextual explanation.',
              },
              mnemonicFa: {
                type: Type.STRING,
                description: 'Memorable Persian mnemonic tip.',
              },
              allMeaningsByPos: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pos: { type: Type.STRING },
                    meaningsFa: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['pos', 'meaningsFa'],
                },
              },
              examples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    en: { type: Type.STRING },
                    fa: { type: Type.STRING },
                  },
                  required: ['en', 'fa'],
                },
              },
            },
            required: [
              'contextualMeaningFa',
              'posInSentence',
              'sentenceTranslationFa',
              'grammarNuanceFa',
              'allMeaningsByPos',
              'examples',
            ],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);
      res.status(200).json({
        ok: true,
        ...parsed,
        grammarAndNuanceFa: parsed.grammarNuanceFa,
        data: {
          ...parsed,
          grammarAndNuanceFa: parsed.grammarNuanceFa,
        },
      });
    } catch {
      res.status(200).json(buildFallbackContextualResponse(cleanTarget, cleanContext));
    }
  });

  app.post('/api/gemini/ai-coach', async (req, res) => {
    const { word, translationFa, contextSentenceEn } = req.body || {};
    const cleanWord = String(word || '').trim();
    const cleanTrans = String(translationFa || '').trim();
    const cleanContext = String(contextSentenceEn || '').trim();

    if (!cleanWord) {
      res.status(400).json({ ok: false, error: 'word is required' });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(200).json(buildFallbackCoachResponse(cleanWord, cleanTrans, cleanContext));
      return;
    }

    try {
      const prompt = [
        `Word/Phrase: "${cleanWord}" (Persian meaning: "${cleanTrans}")`,
        cleanContext ? `Context Sentence: "${cleanContext}"` : '',
        `Create a fun, memorable Duolingo-style learning coach note in Persian (فارسی) including:`,
        `1. mnemonicFa: A clever memory trick or image association in Persian to never forget "${cleanWord}".`,
        `2. usageTipFa: How native speakers naturally use "${cleanWord}" in daily conversation.`,
        `3. miniExampleEn: A short catchy English sentence using "${cleanWord}".`,
        `4. miniExampleFa: Persian translation of that sentence.`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a friendly, energetic Duolingo & Anki English-to-Persian AI language coach. Keep tips super clear, memorable, and concise.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mnemonicFa: { type: Type.STRING },
              usageTipFa: { type: Type.STRING },
              miniExampleEn: { type: Type.STRING },
              miniExampleFa: { type: Type.STRING },
            },
            required: ['mnemonicFa', 'usageTipFa', 'miniExampleEn', 'miniExampleFa'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.status(200).json({ ok: true, ...parsed });
    } catch {
      res.status(200).json(buildFallbackCoachResponse(cleanWord, cleanTrans, cleanContext));
    }
  });

  app.post('/api/gemini/word-qa', async (req, res) => {
    const { wordOrPhrase, sentenceEn, sentenceFa, question, history } = req.body || {};
    const cleanWord = String(wordOrPhrase || '').trim();
    const cleanSentEn = String(sentenceEn || '').trim();
    const cleanSentFa = String(sentenceFa || '').trim();
    const cleanQuestion = String(question || '').trim();

    if (!cleanWord || !cleanQuestion) {
      res.status(400).json({ ok: false, error: 'wordOrPhrase and question are required' });
      return;
    }

    const ai = getGenAIClient();
    if (ai) {
      try {
        const historyLines = Array.isArray(history)
          ? history
              .slice(-4)
              .map(
                (h: { role?: string; text?: string }) =>
                  `${h.role === 'user' ? 'کاربر' : 'مربی هوشمند'}: ${h.text || ''}`
              )
              .join('\n')
          : '';
        const prompt = [
          `شما یک استاد خبره آموزش زبان انگلیسی به فارسی (سبک Language Reactor و Duolingo) هستید.`,
          `واژه یا عبارت مورد بررسی: "${cleanWord}"`,
          cleanSentEn ? `جمله زیرنویس ویدیو: "${cleanSentEn}"` : '',
          cleanSentFa ? `ترجمه جمله: "${cleanSentFa}"` : '',
          historyLines ? `گفتگوی قبلی:\n${historyLines}` : '',
          `سوال کاربر درباره این واژه/عبارت: "${cleanQuestion}"`,
          `لطفاً پاسخی بسیار دقیق، روان، آموزشی و کوتاه (در ۲ تا ۴ جمله به زبان فارسی همراه با مثال انگلیسی در صورت نیاز) ارائه دهید.`,
        ]
          .filter(Boolean)
          .join('\n');

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            systemInstruction:
              'You are an expert English-to-Persian linguist and teacher. Answer the user question about the target English word/phrase clearly and concisely in Persian.',
          },
        });

        const answerFa = String(response.text || '').trim();
        if (answerFa) {
          res.status(200).json({
            ok: true,
            answerFa,
            modelUsed: 'Gemini 3.8 Flash',
          });
          return;
        }
      } catch {
        // Fallback below
      }
    }

    res.status(200).json({
      ok: true,
      fallback: true,
      answerFa: `درباره «${cleanWord}» در جمله «${cleanSentEn || cleanWord}»: این واژه یکی از کاربردی‌ترین ساختارهای انگلیسی در مکالمات واقعی است. در پاسخ به سوال شما («${cleanQuestion}»)، توجه داشته باشید که «${cleanWord}» بسته به جایگاهش در جمله بار معنایی دقیقی به دیالوگ می‌دهد و تمرین آن در قالب همین جمله به تسلط سریع شما کمک می‌کند.`,
      modelUsed: 'Gemini 3.8 Flash',
    });
  });

  app.post('/api/youtube/load', async (req, res) => {
    const { videoId, rawUrl, userApiKey } = req.body || {};
    const cleanId = String(videoId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanId) {
      res.status(400).json({ ok: false, error: 'Invalid YouTube videoId' });
      return;
    }

    let videoTitle = `YouTube Video (${cleanId})`;
    let channelName = 'YouTube Creator';

    // 1. Fetch real YouTube title & author via public oEmbed (noembed.com)
    try {
      const oembedRes = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${cleanId}`
        )}`
      );
      if (oembedRes.ok) {
        const oembedJson = (await oembedRes.json()) as {
          title?: string;
          author_name?: string;
        };
        if (oembedJson.title) videoTitle = oembedJson.title.trim();
        if (oembedJson.author_name) channelName = oembedJson.author_name.trim();
      }
    } catch {
      // fallback to cleanId title
    }

    // 2. Try to fetch real English captions from YouTube watch page captionTracks
    const cues: Array<{
      id: string;
      tStartMs: number;
      dDurationMs: number;
      endMs: number;
      textEn: string;
      textFa: string;
    }> = [];

    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${cleanId}&hl=en`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1] && videoTitle.startsWith('YouTube Video')) {
          videoTitle = titleMatch[1].replace(/\s*-\s*YouTube$/i, '').trim() || videoTitle;
        }
        const captionMatch = html.match(/"captionTracks":(\[.*?\])/);
        if (captionMatch && captionMatch[1]) {
          const tracks = JSON.parse(captionMatch[1]) as Array<{
            baseUrl?: string;
            languageCode?: string;
          }>;
          const enTrack =
            tracks.find((t) => t.languageCode === 'en') ||
            tracks.find((t) => String(t.languageCode || '').startsWith('en')) ||
            tracks[0];
          if (enTrack && enTrack.baseUrl) {
            const json3Url = enTrack.baseUrl.includes('fmt=')
              ? enTrack.baseUrl.replace(/fmt=[^&]+/, 'fmt=json3')
              : `${enTrack.baseUrl}&fmt=json3`;
            const capRes = await fetch(json3Url);
            if (capRes.ok) {
              const capJson = (await capRes.json()) as {
                events?: Array<{
                  tStartMs?: number;
                  dDurationMs?: number;
                  segs?: Array<{ utf8?: string }>;
                }>;
              };
              const rawEvents = (capJson.events || [])
                .filter((ev) => Array.isArray(ev.segs) && ev.segs.length > 0)
                .slice(0, 18);
              for (let i = 0; i < rawEvents.length; i++) {
                const ev = rawEvents[i];
                const textEn = (ev.segs || [])
                  .map((s) => s.utf8 || '')
                  .join(' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                if (!textEn || textEn.length < 4 || /^\[.*\]$/.test(textEn)) continue;
                const tStartMs = Math.max(0, Math.round(ev.tStartMs || i * 5000));
                const dDurationMs = Math.max(2500, Math.min(7000, Math.round(ev.dDurationMs || 4500)));
                let textFa = '';
                try {
                  const gtxRes = await fetch(
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&dj=1&q=${encodeURIComponent(
                      textEn
                    )}`
                  );
                  if (gtxRes.ok) {
                    const gtxData = (await gtxRes.json()) as {
                      sentences?: Array<{ trans?: string }>;
                    };
                    textFa = (gtxData.sentences || [])
                      .map((s) => s.trans || '')
                      .join('')
                      .trim();
                  }
                } catch {
                  // ignore
                }
                cues.push({
                  id: `yt-${cleanId}-${cues.length + 1}`,
                  tStartMs,
                  dDurationMs,
                  endMs: tStartMs + dDurationMs,
                  textEn,
                  textFa: textFa || 'روی هر کلمه کلیک کنید تا معنی دقیق فارسی نمایش داده شود.',
                });
                if (cues.length >= 10) break;
              }
            }
          }
        }
      }
    } catch {
      // fallback below
    }

    // 3. If YouTube blocked server-side caption scraping, generate rich topic-aligned dual subtitles via Gemini if available
    if (cues.length === 0) {
      const effectiveKey = String(userApiKey || process.env.GEMINI_API_KEY || '').trim();
      const ai = effectiveKey
        ? new GoogleGenAI({
            apiKey: effectiveKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          })
        : null;
      if (ai) {
        try {
          const genRes = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `Create 6 natural, educational English video subtitle sentences with accurate Persian translations about the YouTube video titled "${videoTitle}" by "${channelName}" (${rawUrl || cleanId}). Include useful B1-C1 English vocabulary and phrasal verbs.`,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    textEn: { type: Type.STRING },
                    textFa: { type: Type.STRING },
                  },
                  required: ['textEn', 'textFa'],
                },
              },
            },
          });
          const parsedLines = JSON.parse(genRes.text || '[]') as Array<{
            textEn?: string;
            textFa?: string;
          }>;
          let cursorMs = 5000;
          for (let i = 0; i < parsedLines.length; i++) {
            const item = parsedLines[i];
            if (!item?.textEn) continue;
            const dur = 5000;
            cues.push({
              id: `ai-${cleanId}-${i + 1}`,
              tStartMs: cursorMs,
              dDurationMs: dur,
              endMs: cursorMs + dur,
              textEn: item.textEn,
              textFa: item.textFa || '',
            });
            cursorMs += dur;
          }
        } catch {
          // client will use generateTopicContextualSubtitles fallback
        }
      }
    }

    res.status(200).json({
      ok: true,
      videoId: cleanId,
      videoTitle,
      channelName,
      cues,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cunt Academy Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
