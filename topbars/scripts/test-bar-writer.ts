/**
 * Test script for bar-writer prompt
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/test-bar-writer.ts
 *
 * Or add OPENAI_API_KEY to .env file
 */

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Load .env if exists (check both project root and parent)
let envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  envPath = path.join(__dirname, '..', '..', '.env');
}
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Test inputs organized by category
const TEST_INPUTS: Record<string, string[]> = {
  // Core use case - should work well
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

  // Edge cases - interesting challenges
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

  // Specific scenarios
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

  // Longer/complex inputs
  'edge_long': [
    "I've been working on this project for months and nobody seems to appreciate how much effort I put in",
    "She said she loved me but her actions never matched her words and now I realize I was just an option",
    "Everyone around me is getting married and having kids and I'm just focused on my goals",
  ],
};

// Load the system prompt
function loadSystemPrompt(): string {
  const promptPath = path.join(__dirname, '..', 'prompts', 'bar-writer-v1.md');
  return fs.readFileSync(promptPath, 'utf-8');
}

// Test result type
interface TestResult {
  category: string;
  input: string;
  output: string;
  model: string;
  timestamp: string;
  latencyMs: number;
  error?: string;
}

// Run a single test
async function runTest(
  client: OpenAI,
  systemPrompt: string,
  input: string,
  category: string,
  model: string
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input }
      ],
      temperature: 0.9,
      max_completion_tokens: 500,
    });

    const latencyMs = Date.now() - startTime;
    const output = response.choices[0]?.message?.content || '[No response]';

    return {
      category,
      input,
      output,
      model,
      timestamp: new Date().toISOString(),
      latencyMs,
    };
  } catch (error) {
    return {
      category,
      input,
      output: '',
      model,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Main test runner
async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY not found in environment or .env file');
    console.error('Usage: OPENAI_API_KEY=sk-... npx tsx scripts/test-bar-writer.ts');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const systemPrompt = loadSystemPrompt();

  const model = 'gpt-5.2';

  console.log(`\n🎤 Bar Writer Test Suite`);
  console.log(`========================`);
  console.log(`Model: ${model}`);
  console.log(`System prompt: ${systemPrompt.length} chars`);

  // Count total tests
  const totalTests = Object.values(TEST_INPUTS).flat().length;
  console.log(`Total tests: ${totalTests}\n`);

  const results: TestResult[] = [];
  let completed = 0;

  // Run tests by category
  for (const [category, inputs] of Object.entries(TEST_INPUTS)) {
    console.log(`\n📁 Category: ${category}`);
    console.log(`${'─'.repeat(40)}`);

    for (const input of inputs) {
      const result = await runTest(client, systemPrompt, input, category, model);
      results.push(result);
      completed++;

      // Progress indicator
      const status = result.error ? '❌' : '✓';
      console.log(`${status} [${completed}/${totalTests}] "${input.slice(0, 40)}${input.length > 40 ? '...' : ''}" (${result.latencyMs}ms)`);

      // Rate limiting - be nice to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Save results
  const outputDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `bar-writer-test-${timestamp}.json`);

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);

  // Also create a human-readable markdown report
  const reportPath = path.join(outputDir, `bar-writer-test-${timestamp}.md`);
  let report = `# Bar Writer Test Results\n\n`;
  report += `**Model:** ${model}\n`;
  report += `**Date:** ${new Date().toISOString()}\n`;
  report += `**Total Tests:** ${totalTests}\n`;
  report += `**Errors:** ${results.filter(r => r.error).length}\n\n`;

  // Group by category for readability
  for (const [category, inputs] of Object.entries(TEST_INPUTS)) {
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

  fs.writeFileSync(reportPath, report);
  console.log(`📄 Report saved to: ${reportPath}`);

  // Summary stats
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const errorCount = results.filter(r => r.error).length;

  console.log(`\n📊 Summary:`);
  console.log(`   Avg latency: ${Math.round(avgLatency)}ms`);
  console.log(`   Errors: ${errorCount}/${totalTests}`);
  console.log(`\nDone! Review the markdown report for quality assessment.`);
}

main().catch(console.error);
