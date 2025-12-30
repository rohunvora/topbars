#!/bin/bash
# ============================================================================
# CRAWL ARTIST - Fetch quality bars from a Genius artist
# ============================================================================
#
# PURPOSE:
#   Crawls all songs from a Genius artist, scores each annotated lyric,
#   and outputs only the high-quality bars (wordplay, references, etc.)
#
# USAGE:
#   ./tools/crawl-artist.sh <artist_id> [output_file]
#
# EXAMPLES:
#   ./tools/crawl-artist.sh 1812129                    # Ken Carson → stdout
#   ./tools/crawl-artist.sh 1812129 reference/new.jsonl  # Ken Carson → file
#
# FINDING ARTIST IDS:
#   Go to genius.com, find the artist page, the ID is in the URL.
#   Or use the API:
#     curl -s "https://api.genius.com/search?q=Ken%20Carson" \
#       -H "Authorization: Bearer $GENIUS_ACCESS_TOKEN" | jq '.response.hits[0].result.primary_artist.id'
#
# KNOWN ARTIST IDS:
#   Ken Carson:   1812129
#   OsamaSon:     3270750
#   Nettspend:    3406257
#   Yeat:         1476681
#   Drake:        130
#   Frank Ocean:  1985
#   BabyTron:     1907668
#   Bo Burnham:   979
#   Jean Dawson:  1826780
#   Lil B:        455
#   BROCKHAMPTON: 323651
#   Swapa:        2712614
#
# OUTPUT FORMAT (JSONL - one JSON object per line):
#   {
#     "sid": 123,           # Genius song ID
#     "lyric": "...",       # The bar/lyric text
#     "score": 150,         # Quality score (higher = better)
#     "note_len": 500,      # Length of annotation note
#     "votes": 20,          # Community upvotes
#     "acc": true           # Editor verified annotation
#   }
#
# QUALITY SCORING:
#   +50 if acc:true (editor verified annotation)
#   +40 if annotation note > 500 chars
#   +25 if annotation note > 300 chars
#   +10 if annotation note > 100 chars
#   +20 if note contains wordplay keywords (reference, metaphor, pun, etc.)
#   +0.5 per community vote
#   Only bars with score >= 50 are kept
#
# REQUIREMENTS:
#   - GENIUS_ACCESS_TOKEN environment variable (get from genius.com/api-clients)
#   - jq installed (brew install jq)
#   - curl installed
#
# ============================================================================

set -e

# Check for Genius API token
if [ -z "$GENIUS_ACCESS_TOKEN" ]; then
  # Try loading from .env (check both GENIUS_ACCESS_TOKEN and CLIENT_ACCESS_TOKEN)
  if [ -f ".env" ]; then
    export $(grep -E "^(GENIUS_ACCESS_TOKEN|CLIENT_ACCESS_TOKEN)=" .env 2>/dev/null | xargs)
  elif [ -f "../.env" ]; then
    export $(grep -E "^(GENIUS_ACCESS_TOKEN|CLIENT_ACCESS_TOKEN)=" ../.env 2>/dev/null | xargs)
  fi
fi

# Use GENIUS_ACCESS_TOKEN if set, otherwise fall back to CLIENT_ACCESS_TOKEN
TOKEN="${GENIUS_ACCESS_TOKEN:-$CLIENT_ACCESS_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "Error: GENIUS_ACCESS_TOKEN not set"
  echo "Add to .env file or export GENIUS_ACCESS_TOKEN=your_token"
  exit 1
fi
ARTIST_ID=${1:-}
OUTPUT=${2:-/dev/stdout}

if [ -z "$ARTIST_ID" ]; then
  echo "Usage: ./tools/crawl-artist.sh <artist_id> [output_file]"
  echo ""
  echo "Known artist IDs:"
  echo "  Ken Carson:   1812129    Drake:        130"
  echo "  OsamaSon:     3270750    Frank Ocean:  1985"
  echo "  Nettspend:    3406257    BabyTron:     1907668"
  echo "  Yeat:         1476681    Bo Burnham:   979"
  echo "  Jean Dawson:  1826780    Lil B:        455"
  echo "  BROCKHAMPTON: 323651     Swapa:        2712614"
  exit 1
fi

# Keywords that indicate wordplay/references in annotation notes
QUALITY_KEYWORDS="reference|metaphor|compar|television|album|movie|fictional|pun|double|meaning|wordplay"

echo "=== CRAWLING ARTIST $ARTIST_ID ===" >&2
echo "Output: $OUTPUT" >&2
echo "" >&2

# Clear output file if not stdout
if [ "$OUTPUT" != "/dev/stdout" ]; then
  > "$OUTPUT"
fi

# Get all songs with 3+ annotations (songs with fewer rarely have quality bars)
songs=$(curl -s "https://api.genius.com/artists/$ARTIST_ID/songs?per_page=50&sort=popularity" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.response.songs[] | select(.annotation_count > 3) | .id')

total=$(echo "$songs" | wc -l | tr -d ' ')
echo "Songs with 3+ annotations: $total" >&2
echo "" >&2

count=0
for sid in $songs; do
  count=$((count + 1))
  echo -n "[$count/$total] Song $sid: " >&2

  # Fetch referents (annotated lyrics) and score each one
  curl -s "https://api.genius.com/referents?song_id=$sid&per_page=50" \
    -H "Authorization: Bearer $TOKEN" | \
  jq -c --arg sid "$sid" --arg keywords "$QUALITY_KEYWORDS" '
    # Helper to extract plain text from Genius DOM structure
    def getText:
      if type == "string" then .
      elif type == "array" then map(getText) | join("")
      elif type == "object" then
        if .children then .children | getText else "" end
      else "" end;

    .response.referents[] |
    . as $ref |
    ($ref.annotations[0].body.dom | getText) as $note |
    ($note | length) as $len |

    # Calculate quality score
    (
      (if $ref.classification == "accepted" then 50 else 0 end) +
      (if $len > 500 then 40 elif $len > 300 then 25 elif $len > 100 then 10 else 0 end) +
      (if $note | test($keywords; "i") then 20 else 0 end) +
      ($ref.annotations[0].votes_total * 0.5 | floor)
    ) as $score |

    # Only keep bars with score >= 50
    select($score >= 50) |
    {
      sid: ($sid | tonumber),
      lyric: ($ref.fragment | gsub("\n"; " / ")),
      score: $score,
      note_len: $len,
      votes: $ref.annotations[0].votes_total,
      acc: ($ref.classification == "accepted")
    }
  ' >> "$OUTPUT" 2>/dev/null

  # Count bars found for this song
  if [ "$OUTPUT" != "/dev/stdout" ]; then
    bars=$(grep -c "\"sid\":$sid" "$OUTPUT" 2>/dev/null || echo 0)
    echo "$bars quality bars" >&2
  else
    echo "done" >&2
  fi

  # Rate limit: 0.3s between API requests
  sleep 0.3
done

echo "" >&2
echo "=== DONE ===" >&2
if [ "$OUTPUT" != "/dev/stdout" ]; then
  echo "Total quality bars: $(wc -l < "$OUTPUT")" >&2
  echo "Saved to: $OUTPUT" >&2
fi
