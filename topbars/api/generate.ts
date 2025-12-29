import type { VercelRequest, VercelResponse } from '@vercel/node';

// Types
interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  cover: string | null;
  duration_ms: number;
  explicit: boolean;
}

interface GeniusMatch {
  matched: boolean;
  songId: number | null;
  url: string | null;
  title: string | null;
  artist: string | null;
  confidence: number;
  annotationCount: number;
}

interface Bar {
  lyric: string;
  votes: number;
  note: string | null;
  annotationId: number;
  referentId: number;
}

interface TrackResult {
  spotify: SpotifyTrack;
  genius: GeniusMatch;
  topbars: Bar[];
  fallback: string | null;
}

interface PipelineResult {
  playlist: { id: string; name: string; url: string };
  tracks: TrackResult[];
  summary: { tracks_total: number; matched: number; with_bars: number; no_bars: number };
  generatedAt: string;
}

interface DomNode {
  tag?: string;
  children?: (string | DomNode)[];
}

// Config
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH = 'https://accounts.spotify.com/api/token';
const GENIUS_API = 'https://api.genius.com';

// Spotify token cache
let spotifyToken: { token: string; expiresAt: number } | null = null;

// ============================================================================
// SPOTIFY
// ============================================================================

async function getSpotifyToken(): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.expiresAt - 60000) {
    console.log('[spotify] Using cached token');
    return spotifyToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  console.log('[spotify] Attempting auth...');
  console.log('[spotify] CLIENT_ID present:', !!clientId, clientId ? `(${clientId.slice(0, 8)}...)` : '');
  console.log('[spotify] CLIENT_SECRET present:', !!clientSecret, clientSecret ? `(${clientSecret.length} chars)` : '');

  if (!clientId || !clientSecret) {
    console.error('[spotify] ERROR: Missing credentials');
    throw new Error('Missing Spotify credentials - check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(SPOTIFY_AUTH, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[spotify] Auth failed:', res.status, errorText);
    throw new Error(`Spotify auth failed (${res.status}): ${errorText}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  console.log('[spotify] Auth successful, token expires in', data.expires_in, 'seconds');
  spotifyToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return spotifyToken.token;
}

function parsePlaylistUrl(url: string): string | null {
  const match = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function fetchPlaylist(playlistUrl: string): Promise<{ id: string; name: string; url: string; tracks: SpotifyTrack[] }> {
  const playlistId = parsePlaylistUrl(playlistUrl);
  if (!playlistId) {
    console.error('[spotify] Invalid playlist URL:', playlistUrl);
    throw new Error('Invalid Spotify playlist URL');
  }

  console.log('[spotify] Fetching playlist:', playlistId);
  const token = await getSpotifyToken();

  const playlistRes = await fetch(`${SPOTIFY_API}/playlists/${playlistId}?fields=id,name,external_urls`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!playlistRes.ok) {
    const errorText = await playlistRes.text();
    console.error('[spotify] Playlist fetch failed:', playlistRes.status, errorText);
    throw new Error(`Playlist not found (${playlistRes.status})`);
  }

  const playlistData = await playlistRes.json() as { id: string; name: string; external_urls: { spotify: string } };

  // Fetch tracks
  const tracks: SpotifyTrack[] = [];
  let nextUrl: string | null = `${SPOTIFY_API}/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const tracksRes = await fetch(nextUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!tracksRes.ok) break;

    const tracksData = await tracksRes.json() as {
      items: Array<{ track: { id: string; name: string; artists: Array<{ name: string }>; album: { name: string; images: Array<{ url: string }> }; duration_ms: number; explicit: boolean } | null }>;
      next: string | null;
    };

    for (const item of tracksData.items) {
      if (!item.track) continue;
      const t = item.track;
      tracks.push({
        id: t.id,
        title: t.name,
        artist: t.artists[0]?.name || 'Unknown',
        artists: t.artists.map(a => a.name),
        album: t.album.name,
        cover: t.album.images[0]?.url || null,
        duration_ms: t.duration_ms,
        explicit: t.explicit,
      });
    }
    nextUrl = tracksData.next;
  }

  return { id: playlistData.id, name: playlistData.name, url: playlistData.external_urls.spotify, tracks };
}

// ============================================================================
// GENIUS
// ============================================================================

const geniusCache = new Map<string, unknown>();

async function geniusFetch<T>(endpoint: string): Promise<T> {
  if (geniusCache.has(endpoint)) {
    return geniusCache.get(endpoint) as T;
  }

  const token = process.env.GENIUS_ACCESS_TOKEN || process.env.CLIENT_ACCESS_TOKEN;
  if (!token) {
    console.error('[genius] ERROR: Missing token');
    throw new Error('Missing Genius token - check GENIUS_ACCESS_TOKEN env var');
  }

  const res = await fetch(`${GENIUS_API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[genius] API error:', res.status, endpoint, errorText.slice(0, 200));
    throw new Error(`Genius API error: ${res.status}`);
  }

  const data = await res.json() as { response: T };
  geniusCache.set(endpoint, data.response);
  return data.response;
}

function normalize(text: string): string {
  return text.toLowerCase()
    .replace(/\(feat\.?[^)]*\)/gi, '')
    .replace(/\(ft\.?[^)]*\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^\w\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

async function matchTrack(title: string, artist: string): Promise<GeniusMatch> {
  const normalizedQuery = normalize(`${artist} ${title}`);
  const query = encodeURIComponent(normalizedQuery);

  console.log(`[genius] Searching: "${normalizedQuery}"`);

  try {
    const res = await geniusFetch<{ hits: Array<{ result: { id: number; title: string; url: string; primary_artist: { name: string }; annotation_count: number } }> }>(`/search?q=${query}`);

    console.log(`[genius] Got ${res.hits?.length || 0} hits`);

    if (!res.hits?.length) {
      console.log('[genius] No hits found');
      return { matched: false, songId: null, url: null, title: null, artist: null, confidence: 0, annotationCount: 0 };
    }

    const scored = res.hits.map(h => {
      const r = h.result;
      const score = similarity(title, r.title) * 0.6 + similarity(artist, r.primary_artist.name) * 0.4;
      return { hit: h, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const matched = best.score >= 0.5;
    const r = best.hit.result;

    console.log(`[genius] Best match: "${r.title}" by ${r.primary_artist.name} (score: ${best.score.toFixed(2)}, matched: ${matched})`);

    return {
      matched,
      songId: matched ? r.id : null,
      url: matched ? r.url : null,
      title: matched ? r.title : null,
      artist: matched ? r.primary_artist.name : null,
      confidence: Math.round(best.score * 100) / 100,
      annotationCount: matched ? r.annotation_count : 0,
    };
  } catch (err) {
    console.error('[genius] Search error:', err);
    return { matched: false, songId: null, url: null, title: null, artist: null, confidence: 0, annotationCount: 0 };
  }
}

function extractTextFromDom(node: DomNode | string | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.children) return node.children.map(c => extractTextFromDom(c)).join('');
  return '';
}

const GARBAGE = [/^\[.*\]$/, /^(chorus|verse|intro|outro|bridge)$/i, /^\d+$/];

function isGarbage(fragment: string): boolean {
  const t = fragment.trim();
  if (t.length < 5 || t.length > 300) return true;
  return GARBAGE.some(p => p.test(t));
}

interface GeniusReferent {
  id: number;
  fragment: string;
  classification: string; // "accepted" | "unreviewed"
  annotations: Array<{
    id: number;
    votes_total: number;
    state: string; // "accepted" | "pending"
    has_voters: boolean;
    body?: { dom?: DomNode };
    authors?: Array<{ user?: { iq?: number } }>;
  }>;
}

// Regex patterns for note content analysis
const POP_CULTURE_PATTERN = /movie|film|TV|show|series|song|album|brand|game|comic|cartoon|anime|social.?media|myspace|twitter|instagram|youtube|tiktok/i;
const WORDPLAY_PATTERN = /wordplay|double.?meaning|pun|metaphor|compar|reference|refer|similar|entrepreneur|founder|company/i;
const SHOUTOUT_PATTERN = /shout.?out|collaborat|name.?drop/i;
const PRODUCER_TAG_PATTERN = /producer.?tag|tag\b/i;

async function extractBars(songId: number): Promise<{ bars: Bar[]; fallback: string | null }> {
  try {
    const refs = await geniusFetch<{ referents: GeniusReferent[] }>(`/referents?song_id=${songId}&per_page=50`);

    const candidates: Array<Bar & { score: number }> = [];

    for (const ref of refs.referents || []) {
      if (!ref.fragment || isGarbage(ref.fragment)) continue;

      // Skip producer tags (parenthesis-only lines)
      if (/^\s*\(.*\)\s*$/.test(ref.fragment)) continue;

      for (const ann of ref.annotations) {
        // Skip negative-voted annotations
        if (ann.votes_total < 0) continue;

        const note = extractTextFromDom(ann.body?.dom);
        const authorIq = ann.authors?.[0]?.user?.iq || 0;
        const isAccepted = ref.classification === 'accepted' || ann.state === 'accepted';

        // Quality-weighted scoring
        let score = ann.votes_total;

        // Huge bonus for editor-accepted annotations (the gold standard)
        if (isAccepted) score += 100;

        // Bonus for high-IQ authors (experienced Genius contributors)
        if (authorIq >= 10000) score += 30;
        else if (authorIq >= 1000) score += 15;
        else if (authorIq >= 100) score += 5;

        // Bonus for annotations that have received any votes (community engagement)
        if (ann.has_voters) score += 5;

        // NOTE CONTENT ANALYSIS - detect clever vs boring bars
        // Big bonus for pop culture references (movies, TV, games, social media)
        if (POP_CULTURE_PATTERN.test(note)) score += 20;

        // Bonus for wordplay/metaphor explanations
        if (WORDPLAY_PATTERN.test(note)) score += 15;

        // Penalty for shoutouts (not clever, just name-dropping)
        if (SHOUTOUT_PATTERN.test(note)) score -= 15;

        // Penalty for producer tag explanations
        if (PRODUCER_TAG_PATTERN.test(note)) score -= 20;

        // Bonus for substantive notes (indicates thoughtful analysis)
        if (note.length > 50) score += 10;
        else if (note.length > 10) score += 3;

        // Prefer medium-length lyrics (not too short, not walls of text)
        if (ref.fragment.length >= 20 && ref.fragment.length <= 150) score += 5;

        candidates.push({
          lyric: ref.fragment,
          votes: ann.votes_total,
          note: note.length > 10 ? (note.length > 200 ? note.slice(0, 200) + '...' : note) : null,
          annotationId: ann.id,
          referentId: ref.id,
          score,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const bars = candidates.slice(0, 3).map(({ score: _, ...b }) => b);

    return { bars, fallback: bars.length === 0 ? 'No annotated bars available via API.' : null };
  } catch {
    return { bars: [], fallback: 'Failed to fetch bars.' };
  }
}

// ============================================================================
// PIPELINE
// ============================================================================

async function runPipeline(playlistUrl: string): Promise<PipelineResult> {
  console.log('[pipeline] Starting for:', playlistUrl);
  const playlist = await fetchPlaylist(playlistUrl);
  console.log('[pipeline] Playlist loaded:', playlist.name, '-', playlist.tracks.length, 'tracks');

  const trackResults: TrackResult[] = [];

  for (let i = 0; i < playlist.tracks.length; i++) {
    const track = playlist.tracks[i];
    console.log(`[pipeline] [${i + 1}/${playlist.tracks.length}] ${track.artist} - ${track.title}`);
    const genius = await matchTrack(track.title, track.artist);

    let topbars: Bar[] = [];
    let fallback: string | null = null;

    if (genius.matched && genius.songId) {
      const result = await extractBars(genius.songId);
      topbars = result.bars;
      fallback = result.fallback;
    } else {
      fallback = 'No Genius match found.';
    }

    trackResults.push({ spotify: track, genius, topbars, fallback });
  }

  const matched = trackResults.filter(t => t.genius.matched).length;
  const withBars = trackResults.filter(t => t.topbars.length > 0).length;

  return {
    playlist: { id: playlist.id, name: playlist.name, url: playlist.url },
    tracks: trackResults,
    summary: { tracks_total: trackResults.length, matched, with_bars: withBars, no_bars: matched - withBars },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HANDLER
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[handler] Request received:', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body as { url?: string };
  console.log('[handler] Playlist URL:', url);

  if (!url) {
    return res.status(400).json({ error: 'Missing playlist URL' });
  }

  // Log env var presence (not values)
  console.log('[handler] ENV check:');
  console.log('  SPOTIFY_CLIENT_ID:', !!process.env.SPOTIFY_CLIENT_ID);
  console.log('  SPOTIFY_CLIENT_SECRET:', !!process.env.SPOTIFY_CLIENT_SECRET);
  console.log('  GENIUS_ACCESS_TOKEN:', !!process.env.GENIUS_ACCESS_TOKEN);
  console.log('  CLIENT_ACCESS_TOKEN:', !!process.env.CLIENT_ACCESS_TOKEN);

  try {
    const result = await runPipeline(url);
    console.log('[handler] Success! Tracks:', result.summary.tracks_total, 'Matched:', result.summary.matched);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[handler] Pipeline error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
