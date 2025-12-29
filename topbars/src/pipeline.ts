/**
 * Main pipeline: Spotify playlist → Genius bars
 */

import { fetchPlaylist, getSpotifyConfig, parsePlaylistUrl } from './spotify.js';
import { matchTrack, extractBars, getGeniusToken } from './genius.js';
import type { PipelineResult, TrackResult, SpotifyTrack } from './types.js';

interface PipelineOptions {
  maxBars?: number;
  concurrency?: number;
  onProgress?: (current: number, total: number, track: string) => void;
}

/**
 * Process a single track
 */
async function processTrack(
  track: SpotifyTrack,
  geniusToken: string,
  maxBars: number
): Promise<TrackResult> {
  // Match to Genius
  const genius = await matchTrack(track.title, track.artist, geniusToken);

  // Extract bars if matched
  let topbars: TrackResult['topbars'] = [];
  let fallback: string | null = null;

  if (genius.matched && genius.songId) {
    const result = await extractBars(genius.songId, geniusToken, maxBars);
    topbars = result.bars;
    fallback = result.fallback;
  } else {
    fallback = 'No Genius match found.';
  }

  return {
    spotify: track,
    genius,
    topbars,
    fallback,
  };
}

/**
 * Process tracks with controlled concurrency
 */
async function processTracksWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await processor(items[index], index);
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Run the full pipeline on a Spotify playlist
 */
export async function runPipeline(
  playlistUrl: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const { maxBars = 3, concurrency = 3, onProgress } = options;

  // Validate URL
  const playlistId = parsePlaylistUrl(playlistUrl);
  if (!playlistId) {
    throw new Error(`Invalid Spotify playlist URL: ${playlistUrl}`);
  }

  // Get credentials
  const spotifyConfig = getSpotifyConfig();
  const geniusToken = getGeniusToken();

  // Fetch playlist
  console.log(`Fetching playlist...`);
  const playlist = await fetchPlaylist(playlistUrl, spotifyConfig);
  console.log(`Found ${playlist.tracks.length} tracks in "${playlist.name}"`);

  // Process tracks
  const trackResults = await processTracksWithConcurrency(
    playlist.tracks,
    async (track, index) => {
      if (onProgress) {
        onProgress(index + 1, playlist.tracks.length, `${track.artist} - ${track.title}`);
      }
      console.log(`[${index + 1}/${playlist.tracks.length}] ${track.artist} - ${track.title}`);
      return processTrack(track, geniusToken, maxBars);
    },
    concurrency
  );

  // Calculate summary
  const matched = trackResults.filter(t => t.genius.matched).length;
  const withBars = trackResults.filter(t => t.topbars.length > 0).length;

  const result: PipelineResult = {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      url: playlist.url,
    },
    tracks: trackResults,
    summary: {
      tracks_total: trackResults.length,
      matched,
      with_bars: withBars,
      no_bars: matched - withBars,
    },
    generatedAt: new Date().toISOString(),
  };

  console.log(`\nDone! Matched: ${matched}/${result.summary.tracks_total}, With bars: ${withBars}`);

  return result;
}

/**
 * Generate a "line bank" from pipeline results
 */
export function generateLineBank(result: PipelineResult): string {
  const lines: string[] = [];

  for (const track of result.tracks) {
    if (track.topbars.length === 0) continue;

    for (const bar of track.topbars) {
      // Clean up the lyric for copy-paste use
      const cleanLyric = bar.lyric
        .replace(/\n/g, ' / ')
        .replace(/\s+/g, ' ')
        .trim();

      lines.push(cleanLyric);
    }
  }

  return lines.join('\n');
}
