# genius-inspect

A discovery CLI tool that reveals what the official Genius API can and cannot return for a song.

**This is NOT a product.** It's an inspection/probing instrument to understand real API affordances and constraints before building anything on top of the Genius API.

## Purpose

- Parse a Genius song URL
- Fetch and display song metadata
- Fetch description annotations
- Attempt to discover per-line annotation data via official endpoints
- **Honestly report what data exists and what does not**

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your Genius API access token:

```bash
export GENIUS_ACCESS_TOKEN=your_token_here
```

Get a token at: https://genius.com/api-clients

## Usage

```bash
# With URL argument
node dist/index.js https://genius.com/Osamason-habits-lyrics

# Interactive mode (prompts for URL)
node dist/index.js

# Output options
node dist/index.js --raw https://genius.com/...     # Raw /songs API response
node dist/index.js --json https://genius.com/...    # Machine-readable summary
node dist/index.js --max-bars 20 https://genius.com/...  # Show more annotations
node dist/index.js --no-interactive https://genius.com/...  # Auto-select best match
```

## Example Output

```
  genius-inspect v1.0.0
  ----------------------------------------
  URL: https://genius.com/Osamason-habits-lyrics
  Slug: Osamason-habits-lyrics
  Searching for: "Osamason habits"...
  Found: Habits by OsamaSon
  Fetching song data (ID: 12498932)...
  Fetching description annotation...
  Checking for per-line annotations via /referents...

======================================================================
  SONG SUMMARY
======================================================================

  Title:          Habits
  Full Title:     Habits by OsamaSon
  Primary Artist: OsamaSon
  Song URL:       https://genius.com/Osamason-habits-lyrics
  Song ID:        12498932

  Annotations:    25
  Lyrics State:   complete
  Album:          psykotic
  Release Date:   October 10, 2025

  Description Annotation ID: 37112719
  Producers:      Warren Hunter
  Writers:        OsamaSon, Warren Hunter
  Media Links:    soundcloud, youtube

----------------------------------------------------------------------
  ABOUT THIS SONG (Description Annotation)
----------------------------------------------------------------------

  Annotation ID:  37112719
  Votes:          12
  Verified:       No
  State:          pending

  Content:
      (no content)

----------------------------------------------------------------------
  PER-LINE ANNOTATIONS (Referents)
----------------------------------------------------------------------

  Found 10 referent(s) via /referents endpoint.
  Showing top 10 by votes:

  [1] votes: 3
      lyric: "M-m-moshpit jumpin', yeah, get dropped in the pit"
      note:  "(no content)"
      id:    37904934

  [2] votes: 3
      lyric: "These niggas tryna be Batman, but I'm the Joker, bad man"
      note:  "(no content)"
      id:    37482501

  [3] votes: 2
      lyric: "Chorus"
      note:  "(no content)"
      id:    37919995

  ... (more annotations)

======================================================================
  API DISCOVERY SUMMARY
======================================================================

  What the official Genius API provides for this song:

  [OK] Basic metadata (title, artist, album, release date)
  [OK] Song URL and ID
  [OK] Annotation count: 25
  [OK] Lyrics state: complete
  [OK] Description annotation (ID: 37112719)
  [OK] Per-line referents via /referents endpoint (10 found)
  [OK] Media links (YouTube, Spotify, etc.)
  [OK] Credits (producers, writers)

  What is NOT available via official API:

  [XX] Full lyrics text (requires scraping or separate lyrics API)
  [XX] Inline annotation positions within lyrics
  [XX] Complete annotation-to-lyric-line mappings

  The annotation_count (25) reflects total annotations on the
  song page, but accessing all of them may require HTML scraping.

  Done.
```

## Key Findings

### What the Official Genius API Provides

1. **Song Metadata** - Title, artist, album, release date, credits
2. **Annotation Count** - Total number of annotations on the song
3. **Description Annotation** - The "About" section for the song (full text via `body.dom`)
4. **Per-Line Referents** - Via `/referents?song_id={id}` endpoint:
   - Returns a subset of annotations (typically 10)
   - Includes lyric fragments and annotation text
   - Sorted/limited by the API (not all annotations returned)

### What is NOT Available

1. **Full Lyrics** - Not exposed via official API
2. **Complete Annotation List** - Only a subset returned via `/referents`
3. **Inline Positions** - No character offsets for where annotations appear in lyrics
4. **All Referents** - The API may return fewer referents than `annotation_count` suggests

### API Response Structure

Annotations return `body.dom` (a parsed DOM tree) rather than plain text. This tool extracts plain text from the DOM structure automatically.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User input error (invalid URL, cancelled) |
| 2 | Auth/config error (missing/invalid token) |
| 3 | API/network error |

## Constraints

- Uses **ONLY** official Genius API endpoints
- Does **NOT** scrape HTML
- Does **NOT** fetch or display full lyrics
- Does **NOT** log or print access tokens
- Does **NOT** invent or hallucinate annotation data

## License

MIT
