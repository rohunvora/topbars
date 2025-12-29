#!/usr/bin/env node

/**
 * genius-inspect - A discovery CLI for understanding Genius API capabilities
 *
 * This tool reveals what the official Genius API can and cannot return for a song.
 * It does NOT scrape HTML or fetch full lyrics.
 */

import * as readline from 'readline';

// ============================================================================
// TYPES
// ============================================================================

interface GeniusSearchHit {
  highlights: unknown[];
  index: string;
  type: string;
  result: {
    id: number;
    title: string;
    url: string;
    path: string;
    full_title: string;
    primary_artist: {
      id: number;
      name: string;
      url: string;
    };
    annotation_count: number;
  };
}

interface GeniusSong {
  id: number;
  title: string;
  full_title: string;
  url: string;
  path: string;
  annotation_count: number;
  lyrics_state: string;
  primary_artist: {
    id: number;
    name: string;
    url: string;
  };
  description_annotation?: {
    id: number;
    annotatable_id: number;
    annotatable_type: string;
  };
  description?: {
    plain?: string;
    html?: string;
    dom?: unknown;
  };
  // Additional fields we want to inspect
  album?: {
    id: number;
    name: string;
    url: string;
  };
  release_date?: string;
  release_date_for_display?: string;
  featured_artists?: Array<{ id: number; name: string }>;
  producer_artists?: Array<{ id: number; name: string }>;
  writer_artists?: Array<{ id: number; name: string }>;
  custom_performances?: Array<{ label: string; artists: Array<{ id: number; name: string }> }>;
  media?: Array<{ provider: string; url: string; type: string }>;
  song_relationships?: Array<{ relationship_type: string; songs: unknown[] }>;
  // Raw response for --raw mode
  [key: string]: unknown;
}

interface DomNode {
  tag?: string;
  children?: (string | DomNode)[];
  attributes?: Record<string, string>;
}

interface GeniusAnnotation {
  id: number;
  body: {
    plain?: string;
    html?: string;
    dom?: DomNode;
  };
  votes_total: number;
  verified: boolean;
  state: string;
  fragment?: string;
  range?: {
    content: string;
  };
  annotatable?: {
    id: number;
    type: string;
    title?: string;
  };
}

interface GeniusReferent {
  id: number;
  fragment: string;
  range: {
    content: string;
  };
  annotations: GeniusAnnotation[];
  annotatable: {
    id: number;
    type: string;
    title?: string;
  };
}

interface CLIOptions {
  raw: boolean;
  json: boolean;
  maxBars: number;
  noInteractive: boolean;
}

// ============================================================================
// CONFIG
// ============================================================================

const API_BASE = 'https://api.genius.com';

function getAccessToken(): string {
  // Check multiple env var names
  const token = process.env.GENIUS_ACCESS_TOKEN || process.env.CLIENT_ACCESS_TOKEN;

  if (!token) {
    console.error('\n  ERROR: Missing Genius API access token.\n');
    console.error('  Set GENIUS_ACCESS_TOKEN in your environment or .env file.');
    console.error('  Get a token at: https://genius.com/api-clients\n');
    process.exit(2);
  }

  return token;
}

// ============================================================================
// API CLIENT
// ============================================================================

const cache = new Map<string, unknown>();

async function geniusFetch<T>(endpoint: string, token: string): Promise<T> {
  const cacheKey = endpoint;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as T;
  }

  const url = `${API_BASE}${endpoint}`;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.error('\n  ERROR: Authentication failed (401/403).');
        console.error('  Your access token may be invalid or expired.\n');
        process.exit(2);
      }

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        console.error(`  Rate limited. Waiting ${retryAfter}s before retry (${attempts}/${maxAttempts})...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { response: T };
      cache.set(cacheKey, data.response);
      return data.response;

    } catch (error) {
      if (attempts >= maxAttempts) {
        console.error(`\n  ERROR: API request failed after ${maxAttempts} attempts.`);
        console.error(`  Endpoint: ${endpoint}`);
        console.error(`  ${error instanceof Error ? error.message : error}\n`);
        process.exit(3);
      }
      await sleep(1000 * attempts);
    }
  }

  throw new Error('Unexpected: exhausted retry loop');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// URL PARSING
// ============================================================================

function parseGeniusUrl(input: string): { slug: string; originalUrl: string } | null {
  const trimmed = input.trim();

  // Handle full URLs
  const urlPatterns = [
    /^https?:\/\/(www\.)?genius\.com\/(.+?)(?:\?.*)?$/,
    /^genius\.com\/(.+?)(?:\?.*)?$/,
  ];

  for (const pattern of urlPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const slug = match[match.length - 1].replace(/\/$/, '');
      return {
        slug,
        originalUrl: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
      };
    }
  }

  // Handle bare slugs
  if (/^[a-zA-Z0-9-]+-lyrics$/.test(trimmed)) {
    return {
      slug: trimmed,
      originalUrl: `https://genius.com/${trimmed}`
    };
  }

  return null;
}

function slugToSearchQuery(slug: string): string {
  return slug
    .replace(/-lyrics$/, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// SONG RESOLUTION
// ============================================================================

async function searchSongs(query: string, token: string): Promise<GeniusSearchHit[]> {
  const encoded = encodeURIComponent(query);
  const response = await geniusFetch<{ hits: GeniusSearchHit[] }>(
    `/search?q=${encoded}`,
    token
  );
  return response.hits || [];
}

function scoreSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  // Simple word overlap
  const wordsA = new Set(a.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return intersection / union;
}

interface RankedHit {
  hit: GeniusSearchHit;
  score: number;
  matchType: 'exact' | 'high' | 'medium' | 'low';
}

function rankSearchHits(hits: GeniusSearchHit[], targetUrl: string, query: string): RankedHit[] {
  return hits.map(hit => {
    const result = hit.result;
    let score = 0;

    // Exact URL match is best
    if (result.url === targetUrl || result.url === targetUrl.replace(/\/$/, '')) {
      score += 100;
      return { hit, score, matchType: 'exact' as const };
    }

    // URL similarity
    const targetPath = targetUrl.split('genius.com/')[1] || '';
    const resultPath = result.path.replace(/^\//, '');
    if (targetPath.toLowerCase() === resultPath.toLowerCase()) {
      score += 80;
    }

    // Title similarity
    const titleScore = scoreSimilarity(result.title, query) * 30;
    score += titleScore;

    // Full title similarity
    const fullTitleScore = scoreSimilarity(result.full_title, query) * 20;
    score += fullTitleScore;

    let matchType: 'exact' | 'high' | 'medium' | 'low';
    if (score >= 80) matchType = 'high';
    else if (score >= 40) matchType = 'medium';
    else matchType = 'low';

    return { hit, score, matchType };
  }).sort((a, b) => b.score - a.score);
}

async function promptSelection(hits: RankedHit[]): Promise<number> {
  console.log('\n  Multiple matches found. Select a song:\n');

  const display = hits.slice(0, 5);
  display.forEach((ranked, i) => {
    const r = ranked.hit.result;
    console.log(`  [${i + 1}] ${r.full_title}`);
    console.log(`      ${r.url}`);
    console.log(`      (${r.annotation_count} annotations)\n`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('  Enter number (or 0 to cancel): ', (answer) => {
      rl.close();
      const num = parseInt(answer, 10);
      if (num >= 1 && num <= display.length) {
        resolve(display[num - 1].hit.result.id);
      } else {
        console.log('\n  Cancelled.\n');
        process.exit(1);
      }
    });
  });
}

async function resolveSongId(
  urlInfo: { slug: string; originalUrl: string },
  token: string,
  options: CLIOptions
): Promise<number> {
  const query = slugToSearchQuery(urlInfo.slug);

  console.log(`  Searching for: "${query}"...`);

  const hits = await searchSongs(query, token);

  if (hits.length === 0) {
    console.error('\n  ERROR: No songs found for this URL.\n');
    process.exit(1);
  }

  const ranked = rankSearchHits(hits, urlInfo.originalUrl, query);
  const best = ranked[0];

  // Exact or high-confidence match
  if (best.matchType === 'exact' || best.score >= 80) {
    console.log(`  Found: ${best.hit.result.full_title}`);
    return best.hit.result.id;
  }

  // Low confidence - need user input
  if (options.noInteractive) {
    console.log(`  [WARN] Low confidence match (score: ${best.score.toFixed(1)})`);
    console.log(`  Auto-selecting: ${best.hit.result.full_title}`);
    return best.hit.result.id;
  }

  return promptSelection(ranked);
}

// ============================================================================
// SONG METADATA
// ============================================================================

async function fetchSong(songId: number, token: string): Promise<GeniusSong> {
  const response = await geniusFetch<{ song: GeniusSong }>(
    `/songs/${songId}`,
    token
  );
  return response.song;
}

function printSongSummary(song: GeniusSong): void {
  console.log('\n' + '='.repeat(70));
  console.log('  SONG SUMMARY');
  console.log('='.repeat(70));

  console.log(`
  Title:          ${song.title}
  Full Title:     ${song.full_title}
  Primary Artist: ${song.primary_artist.name}
  Song URL:       ${song.url}
  Song ID:        ${song.id}

  Annotations:    ${song.annotation_count}
  Lyrics State:   ${song.lyrics_state || 'unknown'}`);

  if (song.album) {
    console.log(`  Album:          ${song.album.name}`);
  }

  if (song.release_date_for_display) {
    console.log(`  Release Date:   ${song.release_date_for_display}`);
  }

  if (song.description_annotation) {
    console.log(`
  Description Annotation ID: ${song.description_annotation.id}`);
  } else {
    console.log(`
  Description Annotation: (none)`);
  }

  // Show additional metadata if present
  if (song.producer_artists && song.producer_artists.length > 0) {
    console.log(`  Producers:      ${song.producer_artists.map(a => a.name).join(', ')}`);
  }

  if (song.writer_artists && song.writer_artists.length > 0) {
    console.log(`  Writers:        ${song.writer_artists.map(a => a.name).join(', ')}`);
  }

  if (song.media && song.media.length > 0) {
    console.log(`  Media Links:    ${song.media.map(m => m.provider).join(', ')}`);
  }
}

// ============================================================================
// DESCRIPTION ANNOTATION
// ============================================================================

async function fetchAnnotation(annotationId: number, token: string): Promise<GeniusAnnotation> {
  const response = await geniusFetch<{ annotation: GeniusAnnotation }>(
    `/annotations/${annotationId}`,
    token
  );
  return response.annotation;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Extract plain text from Genius DOM structure
 */
function extractTextFromDom(node: DomNode | string | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;

  if (node.children && Array.isArray(node.children)) {
    return node.children.map(child => extractTextFromDom(child)).join('');
  }

  return '';
}

function getAnnotationPlainText(annotation: GeniusAnnotation): string {
  // Try plain first
  if (annotation.body?.plain) {
    return annotation.body.plain;
  }

  // Extract from DOM
  if (annotation.body?.dom) {
    return extractTextFromDom(annotation.body.dom).trim();
  }

  return '';
}

function printDescriptionAnnotation(annotation: GeniusAnnotation): void {
  console.log('\n' + '-'.repeat(70));
  console.log('  ABOUT THIS SONG (Description Annotation)');
  console.log('-'.repeat(70));

  const plainText = getAnnotationPlainText(annotation) || '(no content)';

  console.log(`
  Annotation ID:  ${annotation.id}
  Votes:          ${annotation.votes_total}
  Verified:       ${annotation.verified ? 'Yes' : 'No'}
  State:          ${annotation.state}

  Content:
  ${truncate(plainText, 500).split('\n').map(l => '    ' + l).join('\n')}
`);
}

// ============================================================================
// PER-LINE ANNOTATIONS (REFERENTS)
// ============================================================================

async function fetchReferents(songId: number, token: string): Promise<GeniusReferent[]> {
  // The official API endpoint for referents
  // This returns annotations linked to specific text fragments
  try {
    const response = await geniusFetch<{ referents: GeniusReferent[] }>(
      `/referents?song_id=${songId}`,
      token
    );
    return response.referents || [];
  } catch {
    // Endpoint might not be available or return empty
    return [];
  }
}

function printReferents(referents: GeniusReferent[], maxBars: number): void {
  console.log('\n' + '-'.repeat(70));
  console.log('  PER-LINE ANNOTATIONS (Referents)');
  console.log('-'.repeat(70));

  if (referents.length === 0) {
    console.log(`
  No per-line annotation data is exposed via the official Genius API
  endpoints for this song. The /referents endpoint returned no data.

  NOTE: The official Genius API has limited support for per-line
  annotations. While the website shows annotations on specific lyrics,
  this data may require HTML scraping to access fully.

  Only the description annotation (if present) is reliably accessible
  via the official API.
`);
    return;
  }

  console.log(`
  Found ${referents.length} referent(s) via /referents endpoint.
  Showing top ${Math.min(referents.length, maxBars)} by votes:
`);

  // Sort by votes and display
  const sorted = referents
    .flatMap(ref => ref.annotations.map(ann => ({ ref, ann })))
    .sort((a, b) => b.ann.votes_total - a.ann.votes_total)
    .slice(0, maxBars);

  sorted.forEach((item, i) => {
    const { ref, ann } = item;
    const fragment = ref.fragment || ref.range?.content || '(no fragment)';
    const noteText = getAnnotationPlainText(ann) || '(no content)';

    console.log(`  [${i + 1}] votes: ${ann.votes_total}`);
    console.log(`      lyric: "${truncate(fragment, 60)}"`);
    console.log(`      note:  "${truncate(noteText, 100)}"`);
    console.log(`      id:    ${ann.id}`);
    console.log('');
  });
}

// ============================================================================
// API DISCOVERY REPORT
// ============================================================================

function printApiDiscovery(song: GeniusSong, referents: GeniusReferent[]): void {
  console.log('\n' + '='.repeat(70));
  console.log('  API DISCOVERY SUMMARY');
  console.log('='.repeat(70));

  console.log(`
  What the official Genius API provides for this song:

  [OK] Basic metadata (title, artist, album, release date)
  [OK] Song URL and ID
  [OK] Annotation count: ${song.annotation_count}
  [OK] Lyrics state: ${song.lyrics_state || 'unknown'}
  [${song.description_annotation ? 'OK' : '--'}] Description annotation${song.description_annotation ? ' (ID: ' + song.description_annotation.id + ')' : ' (not present)'}
  [${referents.length > 0 ? 'OK' : '--'}] Per-line referents via /referents endpoint${referents.length > 0 ? ' (' + referents.length + ' found)' : ' (none returned)'}
  [${song.media?.length ? 'OK' : '--'}] Media links (YouTube, Spotify, etc.)
  [${song.producer_artists?.length ? 'OK' : '--'}] Credits (producers, writers)

  What is NOT available via official API:

  [XX] Full lyrics text (requires scraping or separate lyrics API)
  [XX] Inline annotation positions within lyrics
  [XX] Complete annotation-to-lyric-line mappings

  The annotation_count (${song.annotation_count}) reflects total annotations on the
  song page, but accessing all of them may require HTML scraping.
`);
}

// ============================================================================
// OUTPUT MODES
// ============================================================================

function printRaw(song: GeniusSong): void {
  console.log(JSON.stringify(song, null, 2));
}

interface JsonOutput {
  song: {
    id: number;
    title: string;
    full_title: string;
    url: string;
    primary_artist: string;
    annotation_count: number;
    lyrics_state: string;
    description_annotation_id: number | null;
  };
  description_annotation: {
    id: number;
    votes_total: number;
    content_preview: string;
  } | null;
  referents_count: number;
  api_limitations: string[];
}

function printJsonOutput(
  song: GeniusSong,
  descAnnotation: GeniusAnnotation | null,
  referents: GeniusReferent[]
): void {
  const output: JsonOutput = {
    song: {
      id: song.id,
      title: song.title,
      full_title: song.full_title,
      url: song.url,
      primary_artist: song.primary_artist.name,
      annotation_count: song.annotation_count,
      lyrics_state: song.lyrics_state || 'unknown',
      description_annotation_id: song.description_annotation?.id || null,
    },
    description_annotation: descAnnotation ? {
      id: descAnnotation.id,
      votes_total: descAnnotation.votes_total,
      content_preview: truncate(getAnnotationPlainText(descAnnotation), 200),
    } : null,
    referents_count: referents.length,
    api_limitations: [
      'Full lyrics not available via API',
      'Inline annotation positions not exposed',
      'Complete annotation mappings may require scraping',
    ],
  };

  console.log(JSON.stringify(output, null, 2));
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.log(`
  genius-inspect - Discover what the Genius API can provide for a song

  USAGE:
    genius-inspect <genius_song_url>
    genius-inspect                    (interactive prompt)

  OPTIONS:
    --raw            Print raw /songs API response as JSON
    --json           Print machine-readable summary as JSON
    --max-bars N     Maximum per-line annotations to show (default: 10)
    --no-interactive Auto-select best match without prompting

  EXAMPLES:
    genius-inspect https://genius.com/Osamason-habits-lyrics
    genius-inspect Kendrick-lamar-humble-lyrics
    genius-inspect --json https://genius.com/Drake-gods-plan-lyrics

  ENVIRONMENT:
    GENIUS_ACCESS_TOKEN    Your Genius API access token (required)
`);
}

function parseArgs(args: string[]): { url: string | null; options: CLIOptions } {
  const options: CLIOptions = {
    raw: false,
    json: false,
    maxBars: 10,
    noInteractive: false,
  };

  let url: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--raw') {
      options.raw = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-interactive') {
      options.noInteractive = true;
    } else if (arg === '--max-bars') {
      const next = args[++i];
      options.maxBars = parseInt(next, 10) || 10;
    } else if (!arg.startsWith('-')) {
      url = arg;
    }
  }

  return { url, options };
}

async function promptForUrl(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('  Paste Genius song URL: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { url: inputUrl, options } = parseArgs(args);

  console.log('\n  genius-inspect v1.0.0');
  console.log('  ' + '-'.repeat(40));

  // Get access token
  const token = getAccessToken();

  // Get URL
  let url = inputUrl;
  if (!url) {
    if (options.noInteractive) {
      console.error('\n  ERROR: No URL provided and --no-interactive is set.\n');
      process.exit(1);
    }
    url = await promptForUrl();
  }

  // Parse URL
  const urlInfo = parseGeniusUrl(url);
  if (!urlInfo) {
    console.error('\n  ERROR: Invalid Genius URL format.');
    console.error(`  Input: ${url}`);
    console.error('  Expected: https://genius.com/Artist-song-lyrics\n');
    process.exit(1);
  }

  console.log(`  URL: ${urlInfo.originalUrl}`);
  console.log(`  Slug: ${urlInfo.slug}`);

  // Resolve song ID
  const songId = await resolveSongId(urlInfo, token, options);

  // Fetch song details
  console.log(`  Fetching song data (ID: ${songId})...`);
  const song = await fetchSong(songId, token);

  // Raw mode - just dump and exit
  if (options.raw) {
    printRaw(song);
    process.exit(0);
  }

  // Fetch description annotation if present
  let descAnnotation: GeniusAnnotation | null = null;
  if (song.description_annotation?.id) {
    console.log(`  Fetching description annotation...`);
    descAnnotation = await fetchAnnotation(song.description_annotation.id, token);
  }

  // Attempt to fetch per-line referents
  console.log(`  Checking for per-line annotations via /referents...`);
  const referents = await fetchReferents(song.id, token);

  // JSON mode
  if (options.json) {
    printJsonOutput(song, descAnnotation, referents);
    process.exit(0);
  }

  // Human-readable output
  printSongSummary(song);

  if (descAnnotation) {
    printDescriptionAnnotation(descAnnotation);
  }

  printReferents(referents, options.maxBars);
  printApiDiscovery(song, referents);

  console.log('  Done.\n');
}

// Run
main().catch((error) => {
  console.error('\n  FATAL ERROR:', error.message || error);
  process.exit(3);
});
