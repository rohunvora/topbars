/**
 * CLEANUP BARS - Pass 1 of the curation pipeline
 *
 * Takes raw crawled bars and:
 * 1. Removes section markers ([Verse], [Chorus], etc.)
 * 2. Keeps multi-line entries together (don't split " / " - they're context)
 * 3. Dedupes with fuzzy matching (catches near-duplicates)
 * 4. Removes bars that are too short (<5 words) or too long (>20 words)
 * 5. Filters by quality (score >= 60 OR votes >= 3)
 * 6. Cleans text (lowercase, normalize whitespace)
 *
 * USAGE:
 *   npx tsx tools/cleanup-bars.ts [input] [output]
 *
 * EXAMPLES:
 *   npx tsx tools/cleanup-bars.ts reference/crawled-bars.jsonl reference/cleaned-bars.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface RawBar {
  sid: number;
  lyric: string;
  score: number;
  note_len: number;
  votes: number;
  acc: boolean;
}

interface CleanedBar {
  sid: number;
  text: string;
  score: number;
  votes: number;
  acc: boolean;
}

// ============================================================================
// FILTERS
// ============================================================================

// Section markers to remove entirely
const SECTION_MARKER_PATTERN = /^\s*\[.*\]\s*$/;

// Pattern for lines that start with section markers
const STARTS_WITH_SECTION = /^\s*\[(Verse|Chorus|Hook|Bridge|Intro|Outro|Part|Pre-Chorus|Refrain|Interlude|Skit|Produced|Instrumental)/i;

// Producer/meta tags to remove
const PRODUCER_TAG_PATTERN = /^\s*\(?(if young metro|produced by|feat\.|featuring)/i;

// Repetitive/filler patterns
const FILLER_PATTERNS = [
  /^(yeah|yuh|uh|ah|oh|ayy|hey|woo|skrt|brr|gang|what|huh|damn|shit|fuck|bitch|nigga|ayy)+[\s,]*$/i,
  /^(.{1,15}),?\s*\1,?\s*\1/i,  // Same short phrase repeated 3+ times
];

// Minimum/maximum word counts
const MIN_WORDS = 5;
const MAX_WORDS = 20;

// Quality thresholds
const MIN_SCORE = 60;
const MIN_VOTES = 3;

// ============================================================================
// CLEANING FUNCTIONS
// ============================================================================

/**
 * Clean bar text: lowercase, normalize whitespace, remove quotes
 */
function cleanText(text: string): string {
  return text
    // Remove all quote variants (straight and curly)
    .replace(/[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2032\u2033\u2034\u2035\u2036\u2037\u00AB\u00BB]+/g, '')
    // Remove parenthetical ad-libs like (yeah), (what), (uh), (Portable)
    .replace(/\s*\([^)]{1,15}\)\s*/g, ' ')
    // Remove producer tags
    .replace(/\(if young metro[^)]*\)/gi, '')
    // Normalize " / " to comma (keeps it as one bar)
    .replace(/\s*\/\s*/g, ', ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove trailing punctuation except commas
    .replace(/[.!?;:]+$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Check if a line is junk (section marker, producer tag, filler)
 */
function isJunk(text: string): boolean {
  if (SECTION_MARKER_PATTERN.test(text)) return true;
  if (STARTS_WITH_SECTION.test(text)) return true;
  if (PRODUCER_TAG_PATTERN.test(text)) return true;
  for (const pattern of FILLER_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Check if text looks truncated (cut off mid-sentence)
 */
function isTruncated(text: string): boolean {
  // Ends with 1-3 letters followed by nothing (cut mid-word)
  if (/\s[a-z]{1,3}$/.test(text)) return true;
  // Ends with comma (incomplete)
  if (/,\s*$/.test(text)) return true;
  // Ends with "the", "a", "an", "my", "your" etc (cut before noun)
  if (/\s(the|a|an|my|your|his|her|its|our|their|this|that|these|those|some|any|no|every|i|im|and|or|but|so|to|of|in|on|at|for|with|is|was|are|were|be|been|being|have|has|had|wait|like|just)$/i.test(text)) return true;
  // Has obvious truncation markers
  if (/\.\.\.$/.test(text)) return true;
  // Contains unmatched parenthesis (truncated mid-parenthetical)
  const openParens = (text.match(/\(/g) || []).length;
  const closeParens = (text.match(/\)/g) || []).length;
  if (openParens !== closeParens) return true;
  // Starts with paren (missing context before) or ends with opening paren
  if (/^\s*[\(\)]/.test(text) || /\(\s*$/.test(text)) return true;
  return false;
}

/**
 * Count words in a string
 */
function wordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Normalize text for deduplication (aggressive - for fuzzy matching)
 */
function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove all punctuation
    .replace(/\s+/g, ' ')
    .trim()
    // Remove common filler words for fuzzy matching
    .replace(/\b(i|the|a|an|my|your|like|just|got|im|its|that|this|and|or|but|so|yeah|yuh|uh)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get word set for Jaccard similarity
 */
function getWordSet(text: string): Set<string> {
  return new Set(normalizeForDedupe(text).split(/\s+/).filter(w => w.length > 2));
}

/**
 * Calculate Jaccard similarity between two texts
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = getWordSet(a);
  const setB = getWordSet(b);

  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function processFile(inputPath: string): CleanedBar[] {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l.trim());

  const results: CleanedBar[] = [];

  for (const line of lines) {
    let raw: RawBar;
    try {
      raw = JSON.parse(line);
    } catch (e) {
      console.error(`Skipping invalid JSON: ${line.slice(0, 50)}...`);
      continue;
    }

    // Skip if no lyric
    if (!raw.lyric || raw.lyric.trim().length === 0) continue;

    // Skip junk
    if (isJunk(raw.lyric)) continue;

    // Quality filter: must have decent score OR votes
    if (raw.score < MIN_SCORE && raw.votes < MIN_VOTES) continue;

    const cleaned = cleanText(raw.lyric);

    // Skip empty
    if (!cleaned) continue;

    // Word count filter
    const words = wordCount(cleaned);
    if (words < MIN_WORDS || words > MAX_WORDS) continue;

    // Skip if still looks like junk after cleaning
    if (isJunk(cleaned)) continue;

    // Skip truncated bars
    if (isTruncated(cleaned)) continue;

    results.push({
      sid: raw.sid,
      text: cleaned,
      score: raw.score,
      votes: raw.votes,
      acc: raw.acc
    });
  }

  return results;
}

function dedupe(bars: CleanedBar[]): CleanedBar[] {
  // First pass: exact dedupe on normalized text
  const exactMap = new Map<string, CleanedBar>();

  for (const bar of bars) {
    const key = normalizeForDedupe(bar.text);
    const existing = exactMap.get(key);
    if (!existing || bar.score > existing.score) {
      exactMap.set(key, bar);
    }
  }

  const afterExact = Array.from(exactMap.values());
  console.log(`   After exact dedupe: ${afterExact.length}`);

  // Second pass: fuzzy dedupe using Jaccard similarity
  // Sort by score descending so we keep the highest-scored version
  afterExact.sort((a, b) => b.score - a.score);

  const kept: CleanedBar[] = [];
  const SIMILARITY_THRESHOLD = 0.7;

  for (const bar of afterExact) {
    let isDupe = false;

    for (const existing of kept) {
      if (jaccardSimilarity(bar.text, existing.text) >= SIMILARITY_THRESHOLD) {
        isDupe = true;
        break;
      }
    }

    if (!isDupe) {
      kept.push(bar);
    }
  }

  return kept;
}

// ============================================================================
// CLI
// ============================================================================

function main() {
  const args = process.argv.slice(2);

  const inputPath = args[0] || 'reference/crawled-bars.jsonl';
  const outputPath = args[1] || 'reference/cleaned-bars.jsonl';

  console.log(`\n🧹 Cleanup Bars - Pass 1`);
  console.log(`========================`);
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}\n`);

  // Check input exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Count input lines
  const inputLines = fs.readFileSync(inputPath, 'utf-8').trim().split('\n').length;
  console.log(`📥 Input bars: ${inputLines}`);

  // Process
  console.log(`\n⏳ Processing...`);
  const processed = processFile(inputPath);
  console.log(`   After split & filter: ${processed.length}`);

  // Dedupe
  const deduped = dedupe(processed);
  console.log(`   After dedupe: ${deduped.length}`);

  // Sort by score (highest first) for easier review
  deduped.sort((a, b) => b.score - a.score);

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const output = deduped.map(bar => JSON.stringify(bar)).join('\n');
  fs.writeFileSync(outputPath, output + '\n');

  // Stats
  const removed = inputLines - deduped.length;
  const pct = ((removed / inputLines) * 100).toFixed(1);

  console.log(`\n✅ Done!`);
  console.log(`   Removed: ${removed} (${pct}%)`);
  console.log(`   Output:  ${deduped.length} bars`);
  console.log(`   Saved to: ${outputPath}\n`);
}

main();
