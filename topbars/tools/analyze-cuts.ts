/**
 * Analyze what bars were cut and why
 */

import * as fs from 'fs';

interface RawBar {
  sid: number;
  lyric: string;
  score: number;
  note_len: number;
  votes: number;
  acc: boolean;
}

// Same filters as cleanup-bars.ts
const SECTION_MARKER_PATTERN = /^\s*\[.*\]\s*$/;
const STARTS_WITH_SECTION = /^\s*\[(Verse|Chorus|Hook|Bridge|Intro|Outro|Part|Pre-Chorus|Refrain|Interlude|Skit|Produced|Instrumental)/i;
const PRODUCER_TAG_PATTERN = /^\s*\(?(if young metro|produced by|feat\.|featuring)/i;
const FILLER_PATTERNS = [
  /^(yeah|yuh|uh|ah|oh|ayy|hey|woo|skrt|brr|gang|what|huh|damn|shit|fuck|bitch|nigga|ayy)+[\s,]*$/i,
  /^(.{1,15}),?\s*\1,?\s*\1/i,
];

const MIN_WORDS = 5;
const MAX_WORDS = 20;
const MIN_SCORE = 60;
const MIN_VOTES = 3;

function cleanText(text: string): string {
  return text
    .replace(/[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2032\u2033\u2034\u2035\u2036\u2037\u00AB\u00BB]+/g, '')
    .replace(/\s*\([^)]{1,15}\)\s*/g, ' ')
    .replace(/\(if young metro[^)]*\)/gi, '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:]+$/g, '')
    .trim()
    .toLowerCase();
}

function isJunk(text: string): boolean {
  if (SECTION_MARKER_PATTERN.test(text)) return true;
  if (STARTS_WITH_SECTION.test(text)) return true;
  if (PRODUCER_TAG_PATTERN.test(text)) return true;
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

function isTruncated(text: string): boolean {
  if (/\s[a-z]{1,3}$/.test(text)) return true;
  if (/,\s*$/.test(text)) return true;
  if (/\s(the|a|an|my|your|his|her|its|our|their|this|that|these|those|some|any|no|every|i|im|and|or|but|so|to|of|in|on|at|for|with|is|was|are|were|be|been|being|have|has|had|wait|like|just)$/i.test(text)) return true;
  if (/\.\.\.$/.test(text)) return true;
  const openParens = (text.match(/\(/g) || []).length;
  const closeParens = (text.match(/\)/g) || []).length;
  if (openParens !== closeParens) return true;
  if (/^\s*[\(\)]/.test(text) || /\(\s*$/.test(text)) return true;
  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function whyCut(raw: RawBar): string | null {
  if (!raw.lyric || raw.lyric.trim().length === 0) return 'empty';
  if (isJunk(raw.lyric)) return 'junk_raw';
  if (raw.score < MIN_SCORE && raw.votes < MIN_VOTES) return `low_quality (score=${raw.score}, votes=${raw.votes})`;

  const cleaned = cleanText(raw.lyric);
  if (!cleaned) return 'empty_after_clean';

  const words = wordCount(cleaned);
  if (words < MIN_WORDS) return `too_short (${words} words)`;
  if (words > MAX_WORDS) return `too_long (${words} words)`;

  if (isJunk(cleaned)) return 'junk_after_clean';
  if (isTruncated(cleaned)) return 'truncated';

  return null; // Not cut
}

// Main
const content = fs.readFileSync('reference/crawled-bars.jsonl', 'utf-8');
const lines = content.trim().split('\n').filter(l => l.trim());

const cuts: { reason: string; lyric: string; score: number; votes: number }[] = [];
const kept: { lyric: string; score: number; votes: number }[] = [];

for (const line of lines) {
  const raw: RawBar = JSON.parse(line);
  const reason = whyCut(raw);

  if (reason) {
    cuts.push({ reason, lyric: raw.lyric, score: raw.score, votes: raw.votes });
  } else {
    kept.push({ lyric: raw.lyric, score: raw.score, votes: raw.votes });
  }
}

// Group cuts by reason
const byReason: Record<string, typeof cuts> = {};
for (const cut of cuts) {
  const key = cut.reason.split(' ')[0]; // Group by first word
  if (!byReason[key]) byReason[key] = [];
  byReason[key].push(cut);
}

console.log('\n=== CUT SUMMARY ===\n');
for (const [reason, items] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${reason}: ${items.length}`);
}

console.log('\n=== RANDOM SAMPLES OF CUTS ===\n');
const shuffled = cuts.sort(() => Math.random() - 0.5);
for (const cut of shuffled.slice(0, 20)) {
  console.log(`[${cut.reason}]`);
  console.log(`  "${cut.lyric.slice(0, 100)}${cut.lyric.length > 100 ? '...' : ''}"`);
  console.log();
}

// Find "barely cut" - low_quality with score close to threshold
console.log('\n=== BARELY CUT (score 55-59 or votes 2) ===\n');
const barelyCut = cuts
  .filter(c => c.reason.startsWith('low_quality'))
  .filter(c => (c.score >= 55 && c.score < 60) || c.votes === 2)
  .slice(0, 20);

for (const cut of barelyCut) {
  console.log(`[score=${cut.score}, votes=${cut.votes}]`);
  console.log(`  "${cut.lyric.slice(0, 120)}${cut.lyric.length > 120 ? '...' : ''}"`);
  console.log();
}

// Find barely cut by word count
console.log('\n=== BARELY CUT (4 words or 21-22 words) ===\n');
const barelyByWords = cuts
  .filter(c => c.reason.includes('too_short (4') || c.reason.includes('too_long (21') || c.reason.includes('too_long (22'))
  .slice(0, 15);

for (const cut of barelyByWords) {
  const cleaned = cleanText(cut.lyric);
  console.log(`[${cut.reason}]`);
  console.log(`  "${cleaned}"`);
  console.log();
}
