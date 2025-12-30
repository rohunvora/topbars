/**
 * FETCH ANNOTATIONS - Pull Genius annotation data for curated bars
 *
 * For each curated bar, fetches the human-written annotation/explanation
 * from Genius to use as training data.
 *
 * USAGE:
 *   npx tsx tools/fetch-annotations.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIG
// ============================================================================

const RATE_LIMIT_MS = 300; // Be nice to Genius API

// ============================================================================
// TYPES
// ============================================================================

interface CuratedBar {
  sid: number;
  text: string;
  score: number;
  votes: number;
  acc: boolean;
  has_technique: boolean;
  technique_type: string;
  self_contained: boolean;
}

interface AnnotatedBar extends CuratedBar {
  annotation: string;
  referent_id?: number;
}

interface GeniusReferent {
  id: number;
  fragment: string;
  annotations: {
    body: {
      plain: string;
    };
  }[];
}

// ============================================================================
// HELPERS
// ============================================================================

function loadEnv(): void {
  const paths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ];

  for (const envPath of paths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      });
      return;
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.9;
  }

  // Word overlap
  const wordsA = new Set(normA.split(' '));
  const wordsB = new Set(normB.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.length / union.size;
}

// ============================================================================
// GENIUS API
// ============================================================================

async function fetchSongReferents(songId: number, token: string): Promise<GeniusReferent[]> {
  const url = `https://api.genius.com/referents?song_id=${songId}&per_page=50&text_format=plain`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Genius API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response.referents || [];
}

function findMatchingAnnotation(bar: CuratedBar, referents: GeniusReferent[]): { annotation: string; referent_id: number } | null {
  let bestMatch: { referent: GeniusReferent; score: number } | null = null;

  for (const referent of referents) {
    const similarity = textSimilarity(bar.text, referent.fragment);

    if (similarity > 0.5 && (!bestMatch || similarity > bestMatch.score)) {
      bestMatch = { referent, score: similarity };
    }
  }

  if (bestMatch && bestMatch.referent.annotations.length > 0) {
    const annotation = bestMatch.referent.annotations[0].body.plain;
    return {
      annotation,
      referent_id: bestMatch.referent.id
    };
  }

  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  loadEnv();

  const token = process.env.GENIUS_ACCESS_TOKEN || process.env.CLIENT_ACCESS_TOKEN;
  if (!token) {
    console.error('Error: GENIUS_ACCESS_TOKEN or CLIENT_ACCESS_TOKEN not found');
    process.exit(1);
  }

  console.log('\n📝 Fetch Annotations');
  console.log('====================\n');

  // Load curated bars
  const content = fs.readFileSync('reference/curated-bars.jsonl', 'utf-8');
  const bars: CuratedBar[] = content.trim().split('\n').map(l => JSON.parse(l));
  console.log(`📥 Loaded ${bars.length} curated bars\n`);

  // Group bars by song ID to minimize API calls
  const barsBySong = new Map<number, CuratedBar[]>();
  for (const bar of bars) {
    const existing = barsBySong.get(bar.sid) || [];
    existing.push(bar);
    barsBySong.set(bar.sid, existing);
  }
  console.log(`📊 ${barsBySong.size} unique songs\n`);

  // Fetch annotations
  const annotated: AnnotatedBar[] = [];
  let found = 0;
  let notFound = 0;

  const songIds = Array.from(barsBySong.keys());

  for (let i = 0; i < songIds.length; i++) {
    const songId = songIds[i];
    const songBars = barsBySong.get(songId)!;

    process.stdout.write(`⏳ Song ${i + 1}/${songIds.length} (id: ${songId})...`);

    try {
      const referents = await fetchSongReferents(songId, token);

      for (const bar of songBars) {
        const match = findMatchingAnnotation(bar, referents);

        if (match) {
          annotated.push({
            ...bar,
            annotation: match.annotation,
            referent_id: match.referent_id
          });
          found++;
        } else {
          // Still include bar but with empty annotation
          annotated.push({
            ...bar,
            annotation: ''
          });
          notFound++;
        }
      }

      console.log(` ✓ (${songBars.length} bars, ${referents.length} referents)`);
    } catch (e) {
      console.log(` ✗ Error: ${e instanceof Error ? e.message : e}`);

      // Still include bars with empty annotation
      for (const bar of songBars) {
        annotated.push({
          ...bar,
          annotation: ''
        });
        notFound++;
      }
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Save results
  const outputPath = 'reference/curated-bars-annotated.jsonl';
  const output = annotated.map(b => JSON.stringify(b)).join('\n');
  fs.writeFileSync(outputPath, output + '\n');

  console.log(`\n✅ Done!`);
  console.log(`   Found annotations: ${found}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Saved to: ${outputPath}\n`);

  // Show some samples
  console.log('📝 Sample annotations:\n');
  const samples = annotated.filter(b => b.annotation).slice(0, 3);
  for (const bar of samples) {
    console.log(`"${bar.text}"`);
    console.log(`[${bar.technique_type}]`);
    console.log(`Annotation: ${bar.annotation.slice(0, 200)}${bar.annotation.length > 200 ? '...' : ''}`);
    console.log();
  }
}

main().catch(console.error);
