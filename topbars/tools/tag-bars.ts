/**
 * TAG BARS - Pass 2 of the curation pipeline
 *
 * Uses GPT to tag each bar with:
 * - has_technique: boolean (does it have identifiable wordplay?)
 * - technique_type: string (pun, reference, double_meaning, metaphor, callback, comparison, none)
 * - self_contained: boolean (understandable without song context?)
 *
 * USAGE:
 *   npx tsx tools/tag-bars.ts [input] [output]
 *
 * EXAMPLES:
 *   npx tsx tools/tag-bars.ts reference/cleaned-bars.jsonl reference/tagged-bars.jsonl
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIG
// ============================================================================

const MODEL = 'gpt-4o-mini'; // Fast and cheap for classification
const BATCH_SIZE = 20; // Bars per API call
const RATE_LIMIT_MS = 500;

// ============================================================================
// TYPES
// ============================================================================

interface CleanedBar {
  sid: number;
  text: string;
  score: number;
  votes: number;
  acc: boolean;
}

interface TaggedBar extends CleanedBar {
  has_technique: boolean;
  technique_type: string;
  self_contained: boolean;
}

// ============================================================================
// PROMPTS
// ============================================================================

const SYSTEM_PROMPT = `You are a hip-hop lyrics analyst. Your job is to identify wordplay techniques in bars.

For each bar, determine:
1. has_technique: Does this bar contain identifiable wordplay, pun, reference, or clever construction? (true/false)
2. technique_type: What type? One of: pun, reference, double_meaning, metaphor, comparison, callback, wordplay, none
3. self_contained: Can you understand/appreciate the bar without knowing the full song context? (true/false)

Technique definitions:
- pun: Word with multiple meanings used cleverly ("paper like Dunder" - paper=money, Dunder Mifflin sells paper)
- reference: Mentions specific person, brand, movie, show, etc. for effect ("moving like Ferb" - Ferb doesn't talk)
- double_meaning: Phrase that works on two levels ("put that bitch in park" - car gear + ending relationship)
- metaphor: Direct comparison without "like" ("my wrist is a flood")
- comparison: Uses "like" or "as" to compare ("cold like Minnesota")
- callback: References something else in hip-hop/culture that the listener would know
- wordplay: General clever word construction that doesn't fit above categories
- none: Just narrative lyrics, no special technique

Be strict: If there's no clear technique, mark has_technique: false.

Respond with ONLY a JSON array, no markdown, no explanation.`;

function buildUserPrompt(bars: CleanedBar[]): string {
  const numbered = bars.map((b, i) => `${i + 1}. "${b.text}"`).join('\n');
  return `Tag these bars:

${numbered}

Respond with a JSON array of objects with keys: index, has_technique, technique_type, self_contained
Example: [{"index": 1, "has_technique": true, "technique_type": "reference", "self_contained": true}, ...]`;
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

// ============================================================================
// MAIN
// ============================================================================

async function tagBatch(client: OpenAI, bars: CleanedBar[]): Promise<{ index: number; has_technique: boolean; technique_type: string; self_contained: boolean }[]> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(bars) }
    ],
    temperature: 0.1, // Low temp for consistent classification
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || '[]';

  // Try to parse JSON, handling potential markdown code blocks
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse response:', content.slice(0, 200));
    return [];
  }
}

async function main() {
  loadEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const inputPath = args[0] || 'reference/cleaned-bars.jsonl';
  const outputPath = args[1] || 'reference/tagged-bars.jsonl';

  console.log(`\n🏷️  Tag Bars - Pass 2`);
  console.log(`=====================`);
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Model:  ${MODEL}`);
  console.log(`Batch:  ${BATCH_SIZE}\n`);

  // Load bars
  const content = fs.readFileSync(inputPath, 'utf-8');
  const bars: CleanedBar[] = content.trim().split('\n').map(l => JSON.parse(l));
  console.log(`📥 Loaded ${bars.length} bars\n`);

  const client = new OpenAI({ apiKey });
  const tagged: TaggedBar[] = [];
  const batches = Math.ceil(bars.length / BATCH_SIZE);

  for (let i = 0; i < bars.length; i += BATCH_SIZE) {
    const batch = bars.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(`⏳ Batch ${batchNum}/${batches}...`);

    try {
      const tags = await tagBatch(client, batch);

      // Merge tags with bars
      for (const tag of tags) {
        const barIndex = i + tag.index - 1; // tag.index is 1-based
        if (barIndex >= 0 && barIndex < bars.length) {
          tagged.push({
            ...bars[barIndex],
            has_technique: tag.has_technique,
            technique_type: tag.technique_type,
            self_contained: tag.self_contained,
          });
        }
      }

      console.log(` ✓ (${tags.filter(t => t.has_technique).length}/${batch.length} have technique)`);
    } catch (e) {
      console.log(` ✗ Error: ${e instanceof Error ? e.message : e}`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Filter for bars with techniques
  const withTechnique = tagged.filter(b => b.has_technique && b.self_contained);

  // Sort by technique type, then by score
  withTechnique.sort((a, b) => {
    if (a.technique_type !== b.technique_type) {
      return a.technique_type.localeCompare(b.technique_type);
    }
    return b.score - a.score;
  });

  // Write all tagged bars
  const allOutput = tagged.map(b => JSON.stringify(b)).join('\n');
  fs.writeFileSync(outputPath, allOutput + '\n');

  // Write filtered bars (with technique + self-contained)
  const filteredPath = outputPath.replace('.jsonl', '-filtered.jsonl');
  const filteredOutput = withTechnique.map(b => JSON.stringify(b)).join('\n');
  fs.writeFileSync(filteredPath, filteredOutput + '\n');

  // Stats
  console.log(`\n✅ Done!`);
  console.log(`   Total tagged: ${tagged.length}`);
  console.log(`   With technique: ${tagged.filter(b => b.has_technique).length}`);
  console.log(`   Self-contained: ${tagged.filter(b => b.self_contained).length}`);
  console.log(`   Both (for review): ${withTechnique.length}`);

  // Technique breakdown
  const byType: Record<string, number> = {};
  for (const bar of withTechnique) {
    byType[bar.technique_type] = (byType[bar.technique_type] || 0) + 1;
  }
  console.log(`\n📊 By technique:`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }

  console.log(`\n📁 Saved:`);
  console.log(`   All tagged: ${outputPath}`);
  console.log(`   Filtered: ${filteredPath}\n`);
}

main().catch(console.error);
