/**
 * Spotify API client - Client Credentials flow
 */

import type { SpotifyTrack, SpotifyPlaylist } from './types.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH = 'https://accounts.spotify.com/api/token';

interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get access token using Client Credentials flow
 */
async function getAccessToken(config: SpotifyConfig): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await fetch(SPOTIFY_AUTH, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify auth failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

/**
 * Parse Spotify playlist URL to extract playlist ID
 */
export function parsePlaylistUrl(url: string): string | null {
  // https://open.spotify.com/playlist/5sQWFzgP9OzyawVRcEbyz2?si=...
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /spotify:playlist:([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetch all tracks from a playlist (handles pagination)
 */
export async function fetchPlaylist(
  playlistUrl: string,
  config: SpotifyConfig
): Promise<SpotifyPlaylist> {
  const playlistId = parsePlaylistUrl(playlistUrl);
  if (!playlistId) {
    throw new Error(`Invalid Spotify playlist URL: ${playlistUrl}`);
  }

  const token = await getAccessToken(config);

  // Fetch playlist metadata
  const playlistRes = await fetch(`${SPOTIFY_API}/playlists/${playlistId}?fields=id,name,external_urls,owner`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!playlistRes.ok) {
    if (playlistRes.status === 404) {
      throw new Error(`Playlist not found: ${playlistId}`);
    }
    throw new Error(`Spotify API error (${playlistRes.status})`);
  }

  const playlistData = await playlistRes.json() as {
    id: string;
    name: string;
    external_urls: { spotify: string };
    owner: { display_name: string };
  };

  // Fetch all tracks (paginated)
  const tracks: SpotifyTrack[] = [];
  let nextUrl: string | null = `${SPOTIFY_API}/playlists/${playlistId}/tracks?limit=100&fields=items(track(id,name,artists,album,duration_ms,explicit)),next`;

  while (nextUrl) {
    const tracksRes = await fetch(nextUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!tracksRes.ok) {
      throw new Error(`Failed to fetch tracks (${tracksRes.status})`);
    }

    const tracksData = await tracksRes.json() as {
      items: Array<{
        track: {
          id: string;
          name: string;
          artists: Array<{ name: string }>;
          album: { name: string; images: Array<{ url: string }> };
          duration_ms: number;
          explicit: boolean;
        } | null;
      }>;
      next: string | null;
    };

    for (const item of tracksData.items) {
      // Skip null tracks (can happen with unavailable songs)
      if (!item.track) continue;

      const t = item.track;
      tracks.push({
        id: t.id,
        title: t.name,
        artist: t.artists[0]?.name || 'Unknown Artist',
        artists: t.artists.map(a => a.name),
        album: t.album.name,
        cover: t.album.images[0]?.url || null,
        duration_ms: t.duration_ms,
        explicit: t.explicit,
      });
    }

    nextUrl = tracksData.next;
  }

  return {
    id: playlistData.id,
    name: playlistData.name,
    url: playlistData.external_urls.spotify,
    owner: playlistData.owner.display_name,
    tracks,
  };
}

/**
 * Get Spotify config from environment
 */
export function getSpotifyConfig(): SpotifyConfig {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Spotify credentials.\n' +
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env\n' +
      'Get them at: https://developer.spotify.com/dashboard'
    );
  }

  return { clientId, clientSecret };
}
