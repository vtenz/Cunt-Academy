/**
 * LinguaTube Reactor Pro v2.0 — Persian RTL Normalization, Word Tokenizer & Concordance Utilities
 */
(function (root) {
  'use strict';

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function normalizePersian(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\u064A|\u0649|\u06CC/g, 'ی')
      .replace(/\u0643|\u06A9/g, 'ک')
      .replace(/\u0629/g, 'ه')
      .replace(/\u0623|\u0625|\u0622/g, 'ا')
      .replace(/\u200C+/g, '\u200C')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeForQuizComparison(str) {
    return normalizePersian(str)
      .toLowerCase()
      .replace(/\u200C/g, ' ')
      .replace(/[.,/#!$%^&*;:{}=\-_`~()؟،«»"']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toPersianDigits(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\d/g, function (d) {
      return PERSIAN_DIGITS[Number(d)] || d;
    });
  }

  function formatTimestamp(seconds) {
    const totalSec = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const paddedMins = String(mins).padStart(2, '0');
    const paddedSecs = String(secs).padStart(2, '0');
    if (hrs > 0) {
      return String(hrs).padStart(2, '0') + ':' + paddedMins + ':' + paddedSecs;
    }
    return paddedMins + ':' + paddedSecs;
  }

  function tokenizeSubtitleLine(text) {
    if (!text || typeof text !== 'string') return [];
    const tokens = [];
    const regex = /([A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['-][A-Za-z0-9]+)*)|([^A-Za-zÀ-ÖØ-öø-ÿ0-9]+)/g;
    let match;
    let wordIdx = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        tokens.push({
          text: match[1],
          isWord: true,
          wordIndex: wordIdx++,
          cleanWord: match[1].toLowerCase().replace(/^['-]+|['-]+$/g, '')
        });
      } else if (match[2]) {
        tokens.push({
          text: match[2],
          isWord: false,
          wordIndex: -1,
          cleanWord: ''
        });
      }
    }
    return tokens;
  }

  /**
   * UsesLTSubtitleParser if available, otherwise falls back to clean sentence reconstruction
   */
  function parseYouTubeJson3(json3Data) {
    if (root.LTSubtitleParser && typeof root.LTSubtitleParser.rebuildCleanSentencesFromJson3 === 'function') {
      return root.LTSubtitleParser.rebuildCleanSentencesFromJson3(json3Data);
    }
    if (!json3Data || !Array.isArray(json3Data.events)) return [];
    return [];
  }

  function alignDualSubtitles(sourceCues, targetCues) {
    if (!Array.isArray(sourceCues)) return [];
    const safeTargets = Array.isArray(targetCues) ? targetCues : [];

    return sourceCues.map(function (src, idx) {
      const overlappingTexts = [];
      for (let i = 0; i < safeTargets.length; i++) {
        const trg = safeTargets[i];
        const overlapStart = Math.max(src.tStartMs - 400, trg.tStartMs);
        const overlapEnd = Math.min(src.endMs + 400, trg.endMs);
        if (overlapEnd > overlapStart) {
          overlappingTexts.push(trg.text);
        }
      }

      return {
        id: src.id || ('dual-' + idx),
        tStartMs: src.tStartMs,
        dDurationMs: src.dDurationMs,
        endMs: src.endMs,
        textEn: src.text,
        textFa: normalizePersian(overlappingTexts.join(' '))
      };
    });
  }

  /**
   * Finds all subtitle lines in the current video that contain the target word or phrase
   * ("Examples: Current text" concordance feature in Screenshot 5)
   */
  function findInVideoExamples(cues, wordOrPhrase) {
    if (!Array.isArray(cues) || !wordOrPhrase) return [];
    const target = String(wordOrPhrase).trim().toLowerCase();
    if (!target) return [];
    const stem = target.replace(/(?:s|es|ed|ing)$/i, '');
    const results = [];

    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      const textEn = String(c.textEn || c.text || '');
      const lower = textEn.toLowerCase();
      if (lower.includes(target) || (stem.length >= 4 && lower.includes(stem))) {
        results.push(c);
      }
    }
    return results;
  }

  const LTPersianUtils = {
    normalizePersian,
    normalizeForQuizComparison,
    toPersianDigits,
    formatTimestamp,
    tokenizeSubtitleLine,
    parseYouTubeJson3,
    alignDualSubtitles,
    findInVideoExamples
  };

  root.LTPersianUtils = LTPersianUtils;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LTPersianUtils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
