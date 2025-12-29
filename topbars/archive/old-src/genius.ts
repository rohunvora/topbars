/**
 * Genius API client - Search, match, and extract bars
 */

import type {
  GeniusMatch,
  Bar,
  GeniusSearchHit,
  GeniusReferent,
  GeniusSong,
  DomNode,
} from './types.js';

const API_BASE = 'https://api.genius.com';

// Simple in-memory cache
const cache = new Map<string, unknown>();

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // ms between requests

async function rateLimitedFetch(url: string, token: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
    console.error(`  [rate-limit] Waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return rateLimitedFetch(url, token);
  }

  return response;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geniusFetch<T>(endpoint: string, token: string): Promise<T> {
  const cacheKey = endpoint;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) as T;
  }

  const url = `${API_BASE}${endpoint}`;
  const response = await rateLimitedFetch(url, token);

  if (!response.ok) {
    throw new Error(`Genius API error: ${response.status}`);
  }

  const data = await response.json() as { response: T };
  cache.set(cacheKey, data.response);
  return data.response;
}

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

function extractTextFromDom(node: DomNode | string | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;

  if (node.children && Array.isArray(node.children)) {
    return node.children.map(child => extractTextFromDom(child)).join('');
  }

  return '';
}

// ============================================================================
// MATCHING
// ============================================================================

/**
 * Normalize text for comparison
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(feat\.?[^)]*\)/gi, '')  // Remove (feat. ...)
    .replace(/\(ft\.?[^)]*\)/gi, '')    // Remove (ft. ...)
    .replace(/\[.*?\]/g, '')            // Remove [anything]
    .replace(/- (deluxe|remaster|remix|edit|version|anniversary|expanded).*/gi, '')
    .replace(/[''`]/g, "'")             // Normalize quotes
    .replace(/[^\w\s']/g, '')           // Remove punctuation except apostrophes
    .replace(/\s+/g, ' ')               // Collapse whitespace
    .trim();
}

/**
 * Calculate similarity between two strings (0-1)
 */
function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Word-level Jaccard
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Search Genius and find best match for a track
 */
export async function matchTrack(
  title: string,
  artist: string,
  token: string
): Promise<GeniusMatch> {
  const query = `${artist} ${title}`;
  const encoded = encodeURIComponent(normalize(query));

  let hits: GeniusSearchHit[];
  try {
    const response = await geniusFetch<{ hits: GeniusSearchHit[] }>(
      `/search?q=${encoded}`,
      token
    );
    hits = response.hits || [];
  } catch {
    return {
      matched: false,
      songId: null,
      url: null,
      title: null,
      artist: null,
      confidence: 0,
      annotationCount: 0,
    };
  }

  if (hits.length === 0) {
    return {
      matched: false,
      songId: null,
      url: null,
      title: null,
      artist: null,
      confidence: 0,
      annotationCount: 0,
    };
  }

  // Score each hit
  const scored = hits.map(hit => {
    const r = hit.result;
    const titleSim = similarity(title, r.title);
    const artistSim = similarity(artist, r.primary_artist.name);

    // Combined score: title matters more
    const score = titleSim * 0.6 + artistSim * 0.4;

    return { hit, score };
  });

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const r = best.hit.result;

  // Confidence threshold
  const matched = best.score >= 0.5;

  return {
    matched,
    songId: matched ? r.id : null,
    url: matched ? r.url : null,
    title: matched ? r.title : null,
    artist: matched ? r.primary_artist.name : null,
    confidence: Math.round(best.score * 100) / 100,
    annotationCount: matched ? r.annotation_count : 0,
  };
}

// ============================================================================
// BAR EXTRACTION
// ============================================================================

// Patterns to filter out non-bar fragments
const GARBAGE_PATTERNS = [
  /^\[.*\]$/,           // [Chorus], [Verse 1], etc.
  /^(chorus|verse|intro|outro|bridge|hook|pre-chorus|post-chorus)$/i,
  /^(verse|chorus)\s*\d*$/i,
  /^\d+$/,              // Just numbers
  /^[^\w]*$/,           // No word characters
];

function isGarbageFragment(fragment: string): boolean {
  const trimmed = fragment.trim();
  if (trimmed.length < 5) return true;  // Too short
  if (trimmed.length > 300) return true; // Too long for a "bar"

  for (const pattern of GARBAGE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/**
 * Fetch referents (annotated lyric spans) for a song
 */
async function fetchReferents(songId: number, token: string): Promise<GeniusReferent[]> {
  try {
    // Try to get more referents with per_page parameter
    const response = await geniusFetch<{ referents: GeniusReferent[] }>(
      `/referents?song_id=${songId}&per_page=50`,
      token
    );
    return response.referents || [];
  } catch {
    return [];
  }
}

/**
 * Fetch description annotation as fallback
 */
async function fetchDescriptionAnnotation(
  song: GeniusSong,
  token: string
): Promise<string | null> {
  if (!song.description_annotation?.id) return null;

  try {
    const response = await geniusFetch<{ annotation: { body?: { dom?: DomNode } } }>(
      `/annotations/${song.description_annotation.id}`,
      token
    );

    const text = extractTextFromDom(response.annotation?.body?.dom);
    if (text && text.length > 10) {
      // Truncate to reasonable length
      return text.length > 200 ? text.slice(0, 200) + '...' : text;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Extract top bars from a matched song
 */
export async function extractBars(
  songId: number,
  token: string,
  maxBars: number = 3
): Promise<{ bars: Bar[]; fallback: string | null }> {
  // Fetch song details
  let song: GeniusSong;
  try {
    const response = await geniusFetch<{ song: GeniusSong }>(`/songs/${songId}`, token);
    song = response.song;
  } catch {
    return { bars: [], fallback: null };
  }

  // Fetch referents
  const referents = await fetchReferents(songId, token);

  // Extract and score bars
  const candidates: Array<Bar & { score: number }> = [];

  for (const ref of referents) {
    const fragment = ref.fragment?.trim();
    if (!fragment || isGarbageFragment(fragment)) continue;

    for (const ann of ref.annotations) {
      const noteText = extractTextFromDom(ann.body?.dom) || ann.body?.plain || '';

      // Score: votes + bonus for having a note + sweet spot length bonus
      let score = ann.votes_total;
      if (noteText.length > 10) score += 5;

      // Prefer quotes in 20-150 char range
      if (fragment.length >= 20 && fragment.length <= 150) score += 3;

      candidates.push({
        lyric: fragment,
        votes: ann.votes_total,
        note: noteText.length > 10 ? (noteText.length > 150 ? noteText.slice(0, 150) + '...' : noteText) : null,
        annotationId: ann.id,
        referentId: ref.id,
        score,
      });
    }
  }

  // Sort by score desc, take top N
  candidates.sort((a, b) => b.score - a.score);
  const bars: Bar[] = candidates.slice(0, maxBars).map(({ score: _score, ...bar }) => bar);

  // Fallback if no bars
  let fallback: string | null = null;
  if (bars.length === 0) {
    fallback = await fetchDescriptionAnnotation(song, token);
    if (!fallback) {
      fallback = 'No annotated bars available via API.';
    }
  }

  return { bars, fallback };
}

/**
 * Get Genius config from environment
 */
export function getGeniusToken(): string {
  const token = process.env.GENIUS_ACCESS_TOKEN || process.env.CLIENT_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      'Missing Genius API access token.\n' +
      'Set GENIUS_ACCESS_TOKEN in .env\n' +
      'Get one at: https://genius.com/api-clients'
    );
  }

  return token;
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  cache.clear();
}
