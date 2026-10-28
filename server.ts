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
    try {
      const { wordOrPhrase, contextSentence, targetLang = 'Persian' } = req.body || {};
      const cleanTarget = String(wordOrPhrase || '').trim();
      const cleanContext = String(contextSentence || '').trim();

      if (!cleanTarget) {
        res.status(400).json({ ok: false, error: 'wordOrPhrase is required' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({
          ok: false,
          error: 'GEMINI_API_KEY is not configured on the server.',
        });
        return;
      }

      const prompt = [
        `Analyze the English word or phrase "${cleanTarget}" inside the following video subtitle sentence:`,
        `Sentence: "${cleanContext || cleanTarget}"`,
        `Target Language for meanings and explanations: ${targetLang} (فارسی).`,
        `Provide:`,
        `1. contextualMeaningFa: The exact, natural Persian meaning of "${cleanTarget}" in this specific sentence context.`,
        `2. sentenceTranslationFa: Smooth, accurate Persian translation of the full sentence.`,
        `3. grammarAndNuanceFa: Concise Persian explanation of its part of speech, grammatical role, or idiom/phrasal verb nuance in this sentence.`,
        `4. allMeaningsByPos: Comprehensive dictionary meanings of "${cleanTarget}" across all its common parts of speech (4 to 6 distinct Persian meanings).`,
        `5. examples: 2 short, practical English example sentences with Persian translations.`,
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an expert English-to-Persian linguist and lexicographer (similar to Language Reactor Lexa AI). Return accurate, concise, high-clarity Persian explanations.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contextualMeaningFa: {
                type: Type.STRING,
                description: 'Exact Persian meaning of the target word/phrase in this sentence.',
              },
              sentenceTranslationFa: {
                type: Type.STRING,
                description: 'Natural Persian translation of the context sentence.',
              },
              grammarAndNuanceFa: {
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
              'sentenceTranslationFa',
              'grammarAndNuanceFa',
              'allMeaningsByPos',
              'examples',
            ],
          },
        },
      });

      const rawText = response.text || '{}';
      const parsed = JSON.parse(rawText);
      res.json({
        ok: true,
        data: parsed,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        ok: false,
        error: message,
      });
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
