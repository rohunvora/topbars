/**
 * Topbars v0 - Type definitions
 */

// ============================================================================
// SPOTIFY TYPES
// ============================================================================

export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  cover: string | null;
  duration_ms: number;
  explicit: boolean;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  url: string;
  owner: string;
  tracks: SpotifyTrack[];
}

// ============================================================================
// GENIUS TYPES
// ============================================================================

export interface GeniusMatch {
  matched: boolean;
  songId: number | null;
  url: string | null;
  title: string | null;
  artist: string | null;
  confidence: number;
  annotationCount: number;
}

export interface Bar {
  lyric: string;
  votes: number;
  note: string | null;
  annotationId: number;
  referentId: number;
}

// ============================================================================
// PIPELINE OUTPUT TYPES
// ============================================================================

export interface TrackResult {
  spotify: SpotifyTrack;
  genius: GeniusMatch;
  topbars: Bar[];
  fallback: string | null;
}

export interface PipelineResult {
  playlist: {
    id: string;
    name: string;
    url: string;
  };
  tracks: TrackResult[];
  summary: {
    tracks_total: number;
    matched: number;
    with_bars: number;
    no_bars: number;
  };
  generatedAt: string;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

export interface GeniusSearchHit {
  result: {
    id: number;
    title: string;
    url: string;
    path: string;
    full_title: string;
    primary_artist: {
      id: number;
      name: string;
    };
    annotation_count: number;
  };
}

export interface DomNode {
  tag?: string;
  children?: (string | DomNode)[];
}

export interface GeniusReferent {
  id: number;
  fragment: string;
  annotations: Array<{
    id: number;
    votes_total: number;
    body?: {
      plain?: string;
      dom?: DomNode;
    };
  }>;
}

export interface GeniusSong {
  id: number;
  title: string;
  url: string;
  annotation_count: number;
  description_annotation?: {
    id: number;
  };
  description?: {
    plain?: string;
    dom?: DomNode;
  };
}
