/**
 * LinguaTube Reactor Pro v2.0 — Deterministic Static Sentence Reconstructor for YouTube json3
 * Pre-loads the entire caption track upfront, flattens word-level ASR (tOffsetMs) & rolling window
 * events, and consolidates them into complete, non-overlapping static single-line sentences
 * (max 12–14 words or ~75 chars) so words NEVER stream/append mid-playback.
 */
(function (root) {
  'use strict';

  /**
   * Reconstructs clean, static full-sentence subtitle cues from raw YouTube json3 events
   * @param {Array|Object} json3OrEvents - Full json3 object `{ events: [...] }` or `events` array
   * @returns {Array<{id: string, tStartMs: number, dDurationMs: number, endMs: number, text: string}>}
   */
  function rebuildCleanSentencesFromJson3(json3OrEvents) {
    const events = Array.isArray(json3OrEvents)
      ? json3OrEvents
      : (json3OrEvents && Array.isArray(json3OrEvents.events) ? json3OrEvents.events : []);

    if (events.length === 0) return [];

    // Step 1: Flatten all word tokens with exact absolute timestamps (event.tStartMs + seg.tOffsetMs)
    const flatWords = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || typeof ev.tStartMs !== 'number' || isNaN(ev.tStartMs)) continue;
      if (ev.aAppend === 1 && (!ev.segs || ev.segs.every(function (s) { return !s.utf8 || s.utf8 === '\n'; }))) {
        continue;
      }
      if (!Array.isArray(ev.segs) || ev.segs.length === 0) continue;

      const evStart = Math.max(0, Math.round(ev.tStartMs));
      const rawDur = typeof ev.dDurationMs === 'number' && !isNaN(ev.dDurationMs) && ev.dDurationMs > 0
        ? Math.round(ev.dDurationMs)
        : 2800;
      const evDur = Math.min(Math.max(rawDur, 900), 9000);

      for (let s = 0; s < ev.segs.length; s++) {
        const seg = ev.segs[s];
        if (!seg || typeof seg.utf8 !== 'string') continue;
        const cleanChunk = seg.utf8.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleanChunk || /^\[.*\]$/.test(cleanChunk) || /^[♪♫\s]+$/.test(cleanChunk)) continue;

        const segOffset = typeof seg.tOffsetMs === 'number' && !isNaN(seg.tOffsetMs) ? Math.max(0, Math.round(seg.tOffsetMs)) : 0;
        const absStartMs = evStart + segOffset;
        const subWords = cleanChunk.split(/\s+/).filter(Boolean);
        const segSpanMs = ev.segs.length === 1
          ? Math.min(evDur, Math.max(900, subWords.length * 280))
          : Math.max(240, subWords.length * 240);

        for (let w = 0; w < subWords.length; w++) {
          const wordText = subWords[w];
          const wordStartMs = ev.segs.length === 1
            ? absStartMs + Math.round((w / Math.max(1, subWords.length)) * segSpanMs)
            : absStartMs + w * 210;
          const wordEndMs = Math.max(wordStartMs + 280, Math.min(evStart + evDur, wordStartMs + 1600));

          // Deduplicate rolling ASR window duplicate words emitted at nearly identical timestamps
          const prevWord = flatWords[flatWords.length - 1];
          if (
            prevWord &&
            prevWord.word.toLowerCase() === wordText.toLowerCase() &&
            Math.abs(wordStartMs - prevWord.absStartMs) < 450
          ) {
            prevWord.absEndMs = Math.max(prevWord.absEndMs, wordEndMs);
            continue;
          }

          flatWords.push({
            word: wordText,
            absStartMs: wordStartMs,
            absEndMs: wordEndMs
          });
        }
      }
    }

    flatWords.sort(function (a, b) {
      return a.absStartMs - b.absStartMs;
    });

    if (flatWords.length === 0) return [];

    // Step 2: Group flat words into complete, static single-line cues (12–14 words max or ~75 chars)
    const reconstructedCues = [];
    let currentGroup = [];
    let currentCharLen = 0;

    function flushGroup() {
      if (currentGroup.length === 0) return;
      const first = currentGroup[0];
      const last = currentGroup[currentGroup.length - 1];
      const joinedText = currentGroup.map(function (item) { return item.word; }).join(' ');
      const startMs = first.absStartMs;
      const rawEndMs = Math.max(startMs + 900, last.absEndMs);
      const totalDur = Math.max(400, rawEndMs - startMs);

      // Check if word start times have real ASR variance or if they came from a single block
      const hasRealWordOffsets =
        currentGroup.length > 1 &&
        currentGroup[currentGroup.length - 1].absStartMs - currentGroup[0].absStartMs > currentGroup.length * 65;

      const totalChars = Math.max(1, currentGroup.reduce(function (acc, it) { return acc + it.word.length; }, 0));
      let runningChars = 0;

      const wordTimings = currentGroup.map(function (item, idx) {
        if (hasRealWordOffsets) {
          const nextItem = currentGroup[idx + 1];
          const wStart = item.absStartMs;
          const wEnd = nextItem ? Math.max(wStart + 80, nextItem.absStartMs) : rawEndMs;
          return {
            index: idx,
            word: item.word,
            startMs: wStart,
            endMs: wEnd
          };
        } else {
          const fracStart = runningChars / totalChars;
          runningChars += item.word.length;
          const fracEnd = runningChars / totalChars;
          return {
            index: idx,
            word: item.word,
            startMs: Math.round(startMs + fracStart * totalDur),
            endMs: Math.round(startMs + fracEnd * totalDur)
          };
        }
      });

      reconstructedCues.push({
        id: 'cue-' + startMs + '-' + reconstructedCues.length,
        tStartMs: startMs,
        dDurationMs: rawEndMs - startMs,
        endMs: rawEndMs,
        text: joinedText,
        words: wordTimings
      });
      currentGroup = [];
      currentCharLen = 0;
    }

    for (let k = 0; k < flatWords.length; k++) {
      const token = flatWords[k];
      const prevToken = currentGroup.length > 0 ? currentGroup[currentGroup.length - 1] : null;

      // Split if speech pause >= 650ms between consecutive words
      if (prevToken && token.absStartMs - prevToken.absStartMs >= 650 && currentGroup.length >= 3) {
        flushGroup();
      }

      currentGroup.push(token);
      currentCharLen += token.word.length + 1;

      const endsWithTerminalPunct = /[.?!]$/.test(token.word);
      const endsWithCommaBreak = /[,;:]$/.test(token.word) && currentGroup.length >= 9;
      const reachedWordCap = currentGroup.length >= 13 || currentCharLen >= 75;

      if (endsWithTerminalPunct || endsWithCommaBreak || reachedWordCap) {
        flushGroup();
      }
    }
    flushGroup();

    // Step 3: Clamp endMs so cues never overlap
    for (let c = 0; c < reconstructedCues.length; c++) {
      const cue = reconstructedCues[c];
      const nextCue = reconstructedCues[c + 1];
      if (nextCue && cue.endMs >= nextCue.tStartMs) {
        cue.endMs = Math.max(cue.tStartMs + 250, nextCue.tStartMs - 10);
        cue.dDurationMs = cue.endMs - cue.tStartMs;
      }
    }

    return reconstructedCues;
  }

  function decodeHtmlEntities(str) {
    return String(str || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_m, code) {
        return String.fromCharCode(Number(code));
      });
  }

  /**
   * Parses YouTube XML (<timedtext><body><p t="..." d="..."> or <transcript><text start="..." dur="...">)
   * or WebVTT into json3-compatible events and reconstructs clean sentences.
   */
  function parseAnyTimedTextPayload(rawPayload) {
    if (!rawPayload) return [];

    // 1. Direct Object or Array (already parsed JSON3)
    if (typeof rawPayload === 'object') {
      return rebuildCleanSentencesFromJson3(rawPayload);
    }

    const text = String(rawPayload).trim();
    if (!text) return [];

    // 2. JSON3 string
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        return rebuildCleanSentencesFromJson3(parsed);
      } catch (_e) {
        // fall through
      }
    }

    // 3. XML (<timedtext> with <p t="1200" d="3400"> or <transcript> with <text start="1.2" dur="3.4">)
    if (text.includes('<p ') || text.includes('<text ')) {
      const syntheticEvents = [];
      const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
      let match;
      while ((match = pRegex.exec(text)) !== null) {
        const attrs = match[1] || '';
        const inner = match[2] || '';
        const tMatch = /\bt="(\d+)"/.exec(attrs);
        const dMatch = /\bd="(\d+)"/.exec(attrs);
        if (!tMatch) continue;
        const tStartMs = Number(tMatch[1]);
        const dDurationMs = dMatch ? Number(dMatch[1]) : 2800;
        const stripped = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
        if (stripped) {
          syntheticEvents.push({
            tStartMs: tStartMs,
            dDurationMs: dDurationMs,
            segs: [{ utf8: stripped, tOffsetMs: 0 }]
          });
        }
      }

      if (syntheticEvents.length === 0) {
        const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
        while ((match = textRegex.exec(text)) !== null) {
          const attrs = match[1] || '';
          const inner = match[2] || '';
          const startMatch = /\bstart="([\d.]+)"/.exec(attrs);
          const durMatch = /\bdur="([\d.]+)"/.exec(attrs);
          if (!startMatch) continue;
          const tStartMs = Math.round( parseFloat(startMatch[1]) * 1000 );
          const dDurationMs = durMatch ? Math.round( parseFloat(durMatch[1]) * 1000 ) : 2800;
          const stripped = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
          if (stripped) {
            syntheticEvents.push({
              tStartMs: tStartMs,
              dDurationMs: dDurationMs,
              segs: [{ utf8: stripped, tOffsetMs: 0 }]
            });
          }
        }
      }

      if (syntheticEvents.length > 0) {
        return rebuildCleanSentencesFromJson3({ events: syntheticEvents });
      }
    }

    return [];
  }

  const LTSubtitleParser = {
    rebuildCleanSentencesFromJson3: rebuildCleanSentencesFromJson3,
    parseAnyTimedTextPayload: parseAnyTimedTextPayload
  };

  root.LTSubtitleParser = LTSubtitleParser;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LTSubtitleParser;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
