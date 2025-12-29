# Topbars

Extract the best lyric "bars" from a Spotify playlist using Genius annotations.

**Live:** https://topbars.vercel.app

## What it does

1. Takes a Spotify playlist URL
2. Matches each track to Genius
3. Pulls all annotated lyrics (bars) with vote counts
4. Filters and ranks by quality

## Current State

### v0 - Basic pipeline working
- Spotify → Genius matching via API
- Pulls all annotations per song with votes, author IQ, acceptance status
- Basic reductive filters to remove garbage (ad-libs, producer tags, hooks)
- Rating HTML tool for manual curation

### Data Stats (as of 2024-12-29)
- **601 raw bars** from 88-track playlist
- **289 filtered bars** after reductive filters
- **24 curated liked bars** (manually selected gold standard)
- **17 acc:true** (editor-verified quality bars)

### Quality Signals Discovered
- `acc:true` (classification: "accepted") = editor-reviewed, ~40% hit rate for good bars
- High author IQ (>10k) correlates with quality
- Votes alone don't guarantee quality - many high-vote bars are just hooks/ad-libs
- **Wordplay/puns are the key pattern** - hard to detect algorithmically

### Example Liked Bars
```
these niggas be talking like phineas but im like ferb i dont say s
bitch im not tom but i need my space my space yeah
i got paper like dunder
treat her like a psp cause that bitch is a portable
she was moving too fast i had to put that bitch in park
they say he had that bread and then we turned him into toast
```

### Reductive Filters Applied
- Remove bars < 15 chars
- Remove producer tags (parenthesis-only lines)
- Remove repeated ad-libs (Yeah...Yeah...Yeah)
- Remove multi-line hooks (3+ newlines)
- Remove repetitive starts (I see you, Yeah-ah, etc)
- Dedupe identical lyrics
- Require 1+ vote or acc:true

## Project Structure

```
topbars/
├── api/
│   └── generate.ts    # Main API endpoint
├── public/
│   └── index.html     # Frontend UI
├── fixtures/
│   ├── all_bars_601.jsonl      # Raw bar data (601 lines)
│   ├── filtered_bars.json      # Filtered bars (289)
│   ├── liked_bars.json         # 24 curated bars (gold standard)
│   ├── liked_bars_clean.txt    # Clean format (lowercase, no punct)
│   ├── rate_bars_v2.html       # Rating tool
│   └── *.json                  # Cached playlist data
└── vercel.json
```

## API

```bash
POST /api/generate
Content-Type: application/json

{"url": "https://open.spotify.com/playlist/..."}
```

Returns tracks with matched Genius data and top bars.

## Local Development

```bash
cd topbars
vercel dev
```

Open `fixtures/rate_bars_v2.html` in browser to rate bars manually.

## TODO

### High Priority
- [ ] **Build positive filter** - Use 24 liked bars to identify wordplay/pun patterns (may need NLP)
- [ ] **Implement quality scoring** in API - Currently just returns raw bars
- [ ] **Clean display format** - lowercase, no punctuation, no adlibs

### Medium Priority
- [ ] Add more songs to test playlist and re-fetch bars
- [ ] Track which songs have 0 annotations (bad Genius matches)
- [ ] Build "annotation note" analysis - Genius notes often explain wordplay
- [ ] Apply cleaning transform to all bars in display

### Low Priority / Ideas
- [ ] Use Claude/LLM to classify bars as wordplay vs boring
- [ ] Build shareable "top bars" view per playlist
- [ ] Add manual bar submission for songs with no Genius data
- [ ] Create embeddable widget for sharing bars

## Environment Variables

```
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
GENIUS_ACCESS_TOKEN=xxx
```

## Notes

- Many Genius matches are wrong (different songs with same title)
- Songs by smaller artists often have 0 annotations
- The `acc:true` field is gold - only ~3% of bars but ~40% of good ones
- User's bar preferences: clever wordplay, puns, pop culture refs, self-aware humor
