# Quality Scoring Algorithm

## Core Insight

**Annotation note length correlates with bar quality.**

When a Genius annotator writes a long note explaining a lyric, it usually means:
- There's a pop culture reference to explain
- There's wordplay or a pun to break down
- There's a double meaning to unpack

Boring lyrics ("I got money", "Yeah yeah yeah") get short or no annotations.

## Scoring Formula

```
score =
  + 50  if acc:true (editor verified)
  + 40  if note_len > 500 chars
  + 25  if note_len > 300 chars
  + 10  if note_len > 100 chars
  + 20  if note contains quality keywords
  + (votes * 0.5)
```

### Quality Keywords (regex)
```
reference|metaphor|compar|television|album|movie|fictional|pun
```

These words appear in annotations that explain cleverness.

## Validation

Tested on Song 9615170 (Ken Carson - Yale) against human-curated preferences:

| Score | Bar | Human Liked? |
|-------|-----|--------------|
| 151 | Phineas/Ferb reference | YES |
| 116 | Lil Uzi reference | YES |
| 94 | Tom/MySpace pun | YES |
| 76 | Heaven/Hell wordplay | YES |
| 70 | "put in park" double meaning | YES |
| 57 | succubus | NO |
| 32 | emo/slit wrists | NO |

**Result: Top 5 scored bars = 100% of human-liked bars from this song**

## Why Votes Alone Don't Work

High-vote bars are often:
- Hooks/choruses (catchy but not clever)
- Ad-libs that became memes
- Popular lines without wordplay

Example: "Yeah-ah, yeah-ah" got 36 votes but is garbage.

## Why acc:true Matters

`acc:true` means a Genius editor verified the annotation. Only ~3% of bars have this, but ~40% of human-liked bars do. It's a strong quality signal.

## Implementation

See scripts:
- `sandbox/scripts/crawl_artist.sh` - Crawl all songs from artist
- `sandbox/scripts/quality_score.sh` - Score single song

## Score Thresholds

| Threshold | Meaning |
|-----------|---------|
| >= 150 | Exceptional (usually acc:true + long note + votes) |
| >= 120 | Great quality |
| >= 100 | Good quality |
| >= 50 | Minimum for "quality bar" |
| < 50 | Filtered out |

## Future Improvements

1. **LLM classification** - For bars without good annotation notes
2. **Entity detection** - Automatically detect pop culture references
3. **Phonetic analysis** - Detect internal rhymes and wordplay
