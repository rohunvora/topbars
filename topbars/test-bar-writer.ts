/**
 * BAR WRITER TEST SUITE
 *
 * Runs the bar-writer prompt against 98 test inputs across 14 categories
 * to validate output quality and consistency.
 *
 * USAGE:
 *   npx tsx test-bar-writer.ts
 *
 * REQUIREMENTS:
 *   - OPENAI_API_KEY in .env file (or parent directory)
 *   - prompt/bar-writer.md must exist
 *
 * OUTPUTS:
 *   - test-results/bar-writer-test-{timestamp}.json (raw data)
 *   - test-results/bar-writer-test-{timestamp}.md (human readable report)
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MODEL = 'gpt-5.2';
const TEMPERATURE = 0.9;  // Higher = more creative variation
const MAX_TOKENS = 500;   // Enough for 3 bar variations with explanations
const RATE_LIMIT_MS = 500; // Delay between API calls to avoid rate limits

// ============================================================================
// TEST INPUTS BY CATEGORY
// ============================================================================

const TEST_INPUTS: Record<string, string[]> = {

  // CORE USE CASES - These should work well

  'mundane_daily': [
    "I'm tired",
    "I woke up late",
    "Traffic was bad today",
    "I need coffee",
    "I'm going to bed",
    "I'm bored",
    "It's raining outside",
  ],

  'relationships': [
    "She cheated on me",
    "I miss my ex",
    "She's playing games with me",
    "I'm catching feelings",
    "She left me on read",
    "I'm over her",
    "She's beautiful",
    "I don't trust her",
    "She only wants me for my money",
    "I'm ignoring her texts",
    "She moved on fast",
    "I gave her everything",
  ],

  'flex_money': [
    "I'm rich",
    "I bought a new car",
    "I got paid today",
    "I'm broke right now",
    "I spent too much money",
    "My outfit is expensive",
    "I made a lot this month",
    "I don't check price tags",
  ],

  'emotions': [
    "I'm depressed",
    "I'm stressed out",
    "I'm happy right now",
    "I feel alone",
    "I'm anxious about the future",
    "I'm at peace",
    "I feel unstoppable",
    "I'm numb to it all",
  ],

  'social_haters': [
    "My friends are fake",
    "People are talking behind my back",
    "I don't care what they think",
    "I'm better than them",
    "They're jealous of me",
    "Everyone switched up on me",
    "They only call when they need something",
    "I keep my circle small",
  ],

  'hustle_work': [
    "I work too hard",
    "I got promoted",
    "My boss is annoying",
    "I'm grinding every day",
    "I quit my job",
    "I'm self-employed now",
    "I never take days off",
    "I started from nothing",
  ],

  // EDGE CASES - Stress tests for the prompt

  'edge_short': [
    "No",
    "Yes",
    "Whatever",
    "Okay",
    "Bye",
  ],

  'edge_abstract': [
    "Time flies",
    "Life is short",
    "Change is constant",
    "Nothing lasts forever",
    "Everything happens for a reason",
  ],

  'edge_cliche': [
    "Money can't buy happiness",
    "What goes around comes around",
    "It is what it is",
    "At the end of the day",
    "Real recognize real",
  ],

  'edge_questions': [
    "Why do people lie?",
    "What's the point of trying?",
    "Who can I trust?",
    "Where did the time go?",
  ],

  'edge_wholesome': [
    "I love my mom",
    "My dog is my best friend",
    "I'm grateful for today",
    "Family means everything",
    "I finally feel at peace",
  ],

  'edge_technical': [
    "The API latency is too high",
    "My code won't compile",
    "The server is down",
    "I'm debugging this issue",
  ],

  'edge_serious': [
    "My grandma passed away",
    "I'm going through a lot right now",
    "I lost someone close to me",
    "Life hasn't been easy",
  ],

  'edge_no_wordplay': [
    "The sky is blue",
    "Water is wet",
    "I live in a house",
    "Today is Tuesday",
  ],

  // SPECIFIC SCENARIOS

  'scenarios': [
    "I'm at the gym",
    "I'm eating alone",
    "I'm drunk right now",
    "I can't sleep",
    "I'm scrolling on my phone at 3am",
    "I'm in the studio",
    "I'm driving late at night",
    "I'm counting my money",
  ],

  // LONG/COMPLEX INPUTS

  'edge_long': [
    "I've been working on this project for months and nobody seems to appreciate how much effort I put in",
    "She said she loved me but her actions never matched her words and now I realize I was just an option",
    "Everyone around me is getting married and having kids and I'm just focused on my goals",
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

/** Load .env file from current directory or parent */
function loadEnv(): void {
  const paths = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
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

/** Load the bar-writer system prompt */
function loadSystemPrompt(): string {
  const promptPath = path.join(__dirname, 'prompt', 'bar-writer.md');
  if (!fs.existsSync(promptPath)) {
    throw new Error(`System prompt not found at: ${promptPath}`);
  }
  return fs.readFileSync(promptPath, 'utf-8');
}

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  category: string;
  input: string;
  output: string;
  model: string;
  timestamp: string;
  latencyMs: number;
  error?: string;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

/** Run a single test case */
async function runTest(
  client: OpenAI,
  systemPrompt: string,
  input: string,
  category: string,
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input }
      ],
      temperature: TEMPERATURE,
      max_completion_tokens: MAX_TOKENS,
    });

    return {
      category,
      input,
      output: response.choices[0]?.message?.content || '[No response]',
      model: MODEL,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      category,
      input,
      output: '',
      model: MODEL,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Generate markdown report from results */
function generateReport(results: TestResult[], totalTests: number): string {
  let report = `# Bar Writer Test Results\n\n`;
  report += `**Model:** ${MODEL}\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Total Tests:** ${totalTests}\n`;
  report += `**Errors:** ${results.filter(r => r.error).length}\n\n`;

  for (const [category] of Object.entries(TEST_INPUTS)) {
    report += `## ${category}\n\n`;

    const categoryResults = results.filter(r => r.category === category);
    for (const result of categoryResults) {
      report += `### Input: "${result.input}"\n\n`;
      if (result.error) {
        report += `**Error:** ${result.error}\n\n`;
      } else {
        report += `${result.output}\n\n`;
      }
      report += `---\n\n`;
    }
  }

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Load environment variables
  loadEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found');
    console.error('Add it to .env file or set as environment variable');
    process.exit(1);
  }

  // Initialize
  const client = new OpenAI({ apiKey });
  const systemPrompt = loadSystemPrompt();
  const totalTests = Object.values(TEST_INPUTS).flat().length;

  console.log(`\n🎤 Bar Writer Test Suite`);
  console.log(`========================`);
  console.log(`Model: ${MODEL}`);
  console.log(`Prompt: ${systemPrompt.length} chars`);
  console.log(`Tests: ${totalTests}\n`);

  // Run all tests
  const results: TestResult[] = [];
  let completed = 0;

  for (const [category, inputs] of Object.entries(TEST_INPUTS)) {
    console.log(`\n📁 ${category}`);
    console.log(`${'─'.repeat(40)}`);

    for (const input of inputs) {
      const result = await runTest(client, systemPrompt, input, category);
      results.push(result);
      completed++;

      const status = result.error ? '❌' : '✓';
      const truncatedInput = input.length > 40 ? input.slice(0, 40) + '...' : input;
      console.log(`${status} [${completed}/${totalTests}] "${truncatedInput}" (${result.latencyMs}ms)`);

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }

  // Save results
  const outputDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // JSON results
  const jsonPath = path.join(outputDir, `bar-writer-test-${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  // Markdown report
  const mdPath = path.join(outputDir, `bar-writer-test-${timestamp}.md`);
  fs.writeFileSync(mdPath, generateReport(results, totalTests));

  // Summary
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length);
  const errorCount = results.filter(r => r.error).length;

  console.log(`\n✅ Results saved to: ${jsonPath}`);
  console.log(`📄 Report saved to: ${mdPath}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Avg latency: ${avgLatency}ms`);
  console.log(`   Errors: ${errorCount}/${totalTests}`);
}

main().catch(console.error);
