# Topbars

Extract the best lyric "bars" from a Spotify playlist using Genius annotations.

**Live:** https://topbars.vercel.app

## Project Structure

```
topbars/
├── api/                 # Vercel serverless function
│   └── generate.ts      # POST /api/generate
├── public/              # Frontend
│   └── index.html
├── src/                 # TypeScript source (local dev)
├── curated/             # Gold standard data (versioned)
│   ├── liked_bars.json        # 24 human-curated bars
│   ├── liked_bars_clean.txt   # Clean format
│   └── annotations.txt        # Genius annotation notes
├── sandbox/             # Rapid iteration (messy OK)
│   ├── tools/           # Rating HTMLs, test pages
│   ├── scripts/         # One-off bash scripts
│   └── data/            # Temp exports (gitignored)
└── vercel.json

archive/                 # Old projects (genius-inspect CLI)
```

### Philosophy

- **`api/` + `public/`** = Production. Keep clean. Deploy to Vercel.
- **`curated/`** = Gold standard. Versioned. Source of truth.
- **`sandbox/`** = Playground. Experiment freely. `data/` is gitignored.

## Quick Commands

```bash
# Deploy
cd topbars && vercel

# Local dev
cd topbars && vercel dev

# Open rating tool
open topbars/sandbox/tools/rate_bars_v2.html
```

## Current State (2024-12-29)

### Data Pipeline
- Spotify playlist → Genius match → 601 raw bars → 289 filtered → 24 curated

### Quality Signals
| Signal | Reliability | Notes |
|--------|------------|-------|
| `acc:true` | HIGH | Editor-verified, ~40% of liked bars |
| `annotation notes` | HIGH | Often explains wordplay |
| `author_iq > 10k` | MEDIUM | Correlates with quality |
| `votes` | LOW | Hooks get votes too |

### Curated Bar Examples
```
these niggas be talking like phineas but im like ferb i dont say s
bitch im not tom but i need my space my space yeah
i got paper like dunder
treat her like a psp cause that bitch is a portable
```

## TODO

### Next Session
- [ ] Mine annotation notes for "wordplay/pun/reference" keywords
- [ ] Try LLM classification with 24 liked bars as few-shot examples
- [ ] Implement quality scoring in `/api/generate.ts`

### Backlog
- [ ] Clean display format in frontend (lowercase, no punct)
- [ ] Add more songs to test playlist
- [ ] Build shareable bar cards

## Environment

```
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
GENIUS_ACCESS_TOKEN=xxx
```
