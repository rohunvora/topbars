# Quality Scoring Algorithm

## Discovery
Genius annotation **note length** strongly correlates with bar quality.
Longer notes = more explanation = more likely clever wordplay/reference.

## Scoring Formula
```
score = 
  + 50 if acc:true (editor verified)
  + 40 if note_len > 500
  + 25 if note_len > 300  
  + 10 if note_len > 100
  + 20 if note contains quality keywords
  + (votes * 0.5)
```

## Quality Keywords
```regex
reference|metaphor|compar|television|album|movie|fictional|pun
```

## Validation (Song 9615170)
| Score | Bar | User Liked |
|-------|-----|------------|
| 151 | Phineas/Ferb | YES |
| 116 | Lil Uzi ref | YES |
| 94 | Tom/MySpace | YES |
| 76 | Heaven/Hell | YES |
| 70 | put in park | YES |
| 57 | succubus | NO |
| 32 | emo/slit wrists | NO |

**Top 5 by score = 100% of user's liked bars from this song**

## Implementation
See: `sandbox/scripts/quality_score.sh`
