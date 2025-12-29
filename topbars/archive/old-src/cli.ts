#!/usr/bin/env node

/**
 * topbars-playlist CLI
 *
 * Usage:
 *   topbars-playlist <spotify_playlist_url> [--out results.json]
 */

import * as fs from 'fs';
import * as path from 'path';
import { runPipeline, generateLineBank } from './pipeline.js';

// Load .env from parent directory
const envPath = path.resolve(process.cwd(), '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

// Also try .env in current directory
const localEnvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(localEnvPath)) {
  const envContent = fs.readFileSync(localEnvPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

function printUsage(): void {
  console.log(`
  topbars-playlist - Extract top bars from a Spotify playlist via Genius

  USAGE:
    topbars-playlist <spotify_playlist_url> [options]

  OPTIONS:
    --out <file>     Write results to JSON file (default: stdout summary)
    --max-bars N     Max bars per track (default: 3)
    --line-bank      Output line bank (all bars, one per line)
    --help           Show this help

  EXAMPLES:
    topbars-playlist https://open.spotify.com/playlist/5sQWFzgP9OzyawVRcEbyz2
    topbars-playlist https://open.spotify.com/playlist/5sQWFzgP9OzyawVRcEbyz2 --out results.json
    topbars-playlist https://open.spotify.com/playlist/5sQWFzgP9OzyawVRcEbyz2 --line-bank

  ENVIRONMENT:
    SPOTIFY_CLIENT_ID       Spotify app client ID
    SPOTIFY_CLIENT_SECRET   Spotify app client secret
    GENIUS_ACCESS_TOKEN     Genius API access token
`);
}

interface CliArgs {
  url: string | null;
  outFile: string | null;
  maxBars: number;
  lineBank: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    url: null,
    outFile: null,
    maxBars: 3,
    lineBank: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--out') {
      result.outFile = args[++i];
    } else if (arg === '--max-bars') {
      result.maxBars = parseInt(args[++i], 10) || 3;
    } else if (arg === '--line-bank') {
      result.lineBank = true;
    } else if (!arg.startsWith('-')) {
      result.url = arg;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url) {
    console.error('Error: No playlist URL provided.\n');
    printUsage();
    process.exit(1);
  }

  console.log('\n  topbars-playlist v0.1.0');
  console.log('  ' + '-'.repeat(40) + '\n');

  try {
    const result = await runPipeline(args.url, {
      maxBars: args.maxBars,
    });

    // Output
    if (args.lineBank) {
      console.log('\n' + '='.repeat(60));
      console.log('  LINE BANK');
      console.log('='.repeat(60) + '\n');
      console.log(generateLineBank(result));
    } else if (args.outFile) {
      fs.writeFileSync(args.outFile, JSON.stringify(result, null, 2));
      console.log(`\nResults written to: ${args.outFile}`);
    } else {
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('  SUMMARY');
      console.log('='.repeat(60));
      console.log(`
  Playlist: ${result.playlist.name}
  Tracks:   ${result.summary.tracks_total}
  Matched:  ${result.summary.matched}
  With bars: ${result.summary.with_bars}
  No bars:  ${result.summary.no_bars}
`);

      // Print top tracks with bars
      console.log('-'.repeat(60));
      console.log('  TOP BARS FOUND');
      console.log('-'.repeat(60) + '\n');

      let count = 0;
      for (const track of result.tracks) {
        if (track.topbars.length === 0) continue;
        if (count++ >= 10) {
          console.log(`  ... and ${result.summary.with_bars - 10} more tracks with bars\n`);
          break;
        }

        console.log(`  ${track.spotify.artist} - ${track.spotify.title}`);
        for (const bar of track.topbars.slice(0, 2)) {
          const lyric = bar.lyric.replace(/\n/g, ' / ').slice(0, 60);
          console.log(`    "${lyric}${bar.lyric.length > 60 ? '...' : ''}" (${bar.votes} votes)`);
        }
        console.log('');
      }

      console.log('  Use --out results.json to save full results');
      console.log('  Use --line-bank to output all bars\n');
    }

  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
