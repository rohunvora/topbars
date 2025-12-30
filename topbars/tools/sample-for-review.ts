/**
 * SAMPLE FOR REVIEW - Pass 3 of the curation pipeline
 *
 * Takes filtered bars and samples top N from each technique type
 * to create a diverse, manageable set for human review (~280 bars)
 *
 * USAGE:
 *   npx tsx tools/sample-for-review.ts
 */

import * as fs from 'fs';

interface TaggedBar {
  sid: number;
  text: string;
  score: number;
  votes: number;
  acc: boolean;
  has_technique: boolean;
  technique_type: string;
  self_contained: boolean;
}

// Target samples per technique type
const SAMPLES_PER_TYPE: Record<string, number> = {
  reference: 45,
  wordplay: 45,
  double_meaning: 45,
  comparison: 45,
  metaphor: 45,
  pun: 45,
  callback: 40, // Take all or most since there are only 38
};

async function main() {
  console.log(`\n📋 Sample for Review - Pass 3`);
  console.log(`==============================\n`);

  // Load filtered bars
  const content = fs.readFileSync('reference/tagged-bars-filtered.jsonl', 'utf-8');
  const bars: TaggedBar[] = content.trim().split('\n').map(l => JSON.parse(l));

  console.log(`📥 Loaded ${bars.length} filtered bars\n`);

  // Group by technique type
  const byType: Record<string, TaggedBar[]> = {};
  for (const bar of bars) {
    const type = bar.technique_type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(bar);
  }

  // Sort each group by score descending
  for (const type of Object.keys(byType)) {
    byType[type].sort((a, b) => b.score - a.score);
  }

  // Sample from each type
  const sampled: TaggedBar[] = [];

  console.log(`📊 Sampling by technique:`);
  for (const [type, count] of Object.entries(SAMPLES_PER_TYPE)) {
    const available = byType[type] || [];
    const toTake = Math.min(count, available.length);
    const taken = available.slice(0, toTake);
    sampled.push(...taken);
    console.log(`   ${type}: ${toTake}/${available.length}`);
  }

  // Shuffle the sampled bars for review (avoid bias from seeing all of one type)
  sampled.sort(() => Math.random() - 0.5);

  // Write output
  const outputPath = 'reference/review-bars.jsonl';
  const output = sampled.map(b => JSON.stringify(b)).join('\n');
  fs.writeFileSync(outputPath, output + '\n');

  console.log(`\n✅ Done!`);
  console.log(`   Total sampled: ${sampled.length}`);
  console.log(`   Saved to: ${outputPath}\n`);

  // Show some samples
  console.log(`📝 Random samples:\n`);
  const samples = sampled.slice(0, 10);
  for (const bar of samples) {
    console.log(`[${bar.technique_type}] "${bar.text}"`);
    console.log();
  }
}

main().catch(console.error);
