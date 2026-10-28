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
  const apiKey = process.env.GEMINI_API_KEY;
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
        `5. allMeaningsByPos: Comprehensive dictionary meanings of "${cleanTarget}" across all its common parts of speech (4 to 6 distinct Persian meanings).`,
        `6. examples: 2 short, practical English example sentences with Persian translations.`,
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

  if (process.env.NODE_ENV !== 'production') {
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
