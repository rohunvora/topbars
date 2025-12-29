# Topbars

Surface the best lyric "bars" (clever wordplay, references, puns) from hip-hop songs using Genius annotation data.

**Live:** https://topbars.vercel.app

---

## Overview

The core insight: **Genius annotation note length correlates with bar quality.** Longer notes = annotators explaining wordplay = clever bars.

### What Works

1. **Quality Scoring Algorithm** - Bars are scored based on:
   - `+50` if `acc:true` (editor-verified annotation)
   - `+40` if annotation note > 500 chars
   - `+25` if note > 300 chars
   - `+20` if note contains quality keywords (reference, metaphor, pun, etc.)
   - `+0.5` per community vote

2. **Artist Crawler** - Fetches all songs from an artist, scores every annotated bar, keeps only quality bars (score >= 50)

3. **Curated Dataset** - 24 human-verified "gold standard" bars that validate the algorithm

### Current Stats

| Metric | Value |
|--------|-------|
| Artists crawled | 3 (Ken Carson, OsamaSon, Nettspend) |
| Quality bars discovered | 295 |
| Human-curated bars | 24 |
| Algorithm accuracy | Top 5 scored = 100% of liked bars |

---

## Project Structure

```
topbars/
├── api/
│   └── generate.ts          # Vercel serverless endpoint
├── public/
│   └── index.html           # Frontend (submit playlist URL)
├── src/                     # TypeScript source (not currently used in prod)
│   ├── spotify.ts           # Spotify API client
│   ├── genius.ts            # Genius API client
│   └── pipeline.ts          # Data processing
├── curated/                 # Gold standard data (versioned)
│   ├── liked_bars.json      # 24 human-verified quality bars
│   ├── liked_bars_clean.txt # Clean format (lowercase, no punct)
│   ├── annotations.txt      # Sample Genius annotation notes
│   └── quality_algorithm.md # Scoring algorithm documentation
├── sandbox/                 # Experimental (data/ is gitignored)
│   ├── scripts/
│   │   ├── crawl_artist.sh  # Crawl all songs from an artist
│   │   ├── quality_score.sh # Score bars for a single song
│   │   └── scan_notes.sh    # Scan annotation notes for keywords
│   ├── tools/
│   │   ├── crawled_bars.html    # View/filter crawled bars
│   │   └── rate_bars_v2.html    # Manual bar rating tool
│   └── data/                # Temp data files (gitignored)
└── vercel.json

archive/                     # Deprecated code
└── genius-inspect/          # Old CLI tool for API exploration
```

---

## Key Files

### `sandbox/scripts/crawl_artist.sh`
Crawls all songs from a Genius artist ID, scores each bar, outputs quality bars.

```bash
# Usage
./crawl_artist.sh <artist_id> <output_file>

# Example: Crawl Ken Carson (ID: 1812129)
./crawl_artist.sh 1812129 /tmp/kencarson_bars.jsonl

# Find artist ID
curl -s "https://api.genius.com/search?q=Artist%20Name" \
  -H "Authorization: Bearer $TOKEN" | jq '.response.hits[0].result.primary_artist.id'
```

### `sandbox/scripts/quality_score.sh`
Scores all bars for a single song.

```bash
./quality_score.sh <song_id>
```

### `sandbox/tools/crawled_bars.html`
Interactive viewer for crawled bars. Filter by score threshold and artist.

### `curated/quality_algorithm.md`
Documents the scoring formula and validation results.

---

## API

### POST /api/generate

Takes a Spotify playlist URL, matches tracks to Genius, returns bars.

```bash
curl -X POST https://topbars.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://open.spotify.com/playlist/..."}'
```

**Note:** The API doesn't currently implement the quality scoring algorithm. It returns raw bars sorted by votes. Implementing the scoring algorithm in the API is a TODO.

---

## Environment Variables

```bash
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
GENIUS_ACCESS_TOKEN=xxx   # Also used in shell scripts as TOKEN
```

---

## Development

```bash
# Local dev server
cd topbars && vercel dev

# Deploy
cd topbars && vercel

# Run crawler
cd topbars/sandbox/scripts
./crawl_artist.sh 1812129 /tmp/output.jsonl

# View results
open topbars/sandbox/tools/crawled_bars.html
```

---

## TODO

### High Priority
- [ ] **Implement quality scoring in API** - Currently returns raw bars, should use the scoring algorithm
- [ ] **Crawl more artists** - Build larger database of pre-scored bars
- [ ] **Match playlist to database** - Instead of fetching live, match against pre-crawled bars

### Medium Priority
- [ ] Add more filter options to HTML viewer (search, sort)
- [ ] Build shareable bar cards for social media
- [ ] Track which songs have bad Genius matches

### Low Priority
- [ ] LLM classification for bars that lack annotation notes
- [ ] User accounts to save liked bars
- [ ] Chrome extension to show bars on Spotify

---

## Key Insights

1. **Note length > votes** - High-vote bars are often just hooks. Long annotation notes indicate someone explained wordplay.

2. **`acc:true` is gold** - Only ~3% of bars have this, but ~40% of liked bars do. Editor verification matters.

3. **Quality keywords** - Annotations containing "reference", "metaphor", "pun", "television", "album" etc. usually explain cleverness.

4. **Reductive filtering insufficient** - Removing garbage (ad-libs, short bars, hooks) still leaves mostly boring bars. Need positive signals.

---

## Example Quality Bars

```
these niggas be talking like phineas but im like ferb i dont say shit
bitch im not tom but i need my space my space yeah
i got paper like dunder
treat her like a psp cause that bitch is a portable
jennifers body my bitch is a hottie my bitch is a boy eater
sent him to the cemetery and not the haunted mound
```
