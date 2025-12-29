#!/bin/bash
#
# crawl_artist.sh - Crawl all songs from a Genius artist and extract quality bars
#
# USAGE:
#   ./crawl_artist.sh <artist_id> <output_file>
#
# EXAMPLE:
#   ./crawl_artist.sh 1812129 /tmp/kencarson_bars.jsonl
#
# HOW TO FIND ARTIST ID:
#   curl -s "https://api.genius.com/search?q=Ken%20Carson" \
#     -H "Authorization: Bearer $TOKEN" | jq '.response.hits[0].result.primary_artist.id'
#
# KNOWN ARTIST IDS:
#   Ken Carson:  1812129
#   OsamaSon:    3270750
#   Nettspend:   3406257
#   Yeat:        1476681
#
# OUTPUT FORMAT (JSONL):
#   {"sid":123,"lyric":"...","score":150,"note_len":500,"votes":20,"acc":true,"artist":"ken carson"}
#
# QUALITY SCORING:
#   +50 if acc:true (editor verified)
#   +40 if note > 500 chars
#   +25 if note > 300 chars
#   +10 if note > 100 chars
#   +20 if note contains quality keywords
#   +0.5 per vote
#   Only bars with score >= 50 are kept
#

TOKEN="V8GNEnHfO3kFH7Z4KqIysAypK6kEe18TlXLiVvCaXd7G17BjnhPzGlRW840ChF0b"
ARTIST_ID=${1:-3270750}  # Default: OsamaSon
OUTPUT=${2:-/tmp/crawl_output.jsonl}

# Quality keywords that indicate wordplay/references in annotation notes
QUALITY_KEYWORDS="reference|metaphor|compar|television|album|movie|fictional|pun"

echo "=== CRAWLING ARTIST $ARTIST_ID ==="
echo "Output: $OUTPUT"
echo ""

# Clear output file
> "$OUTPUT"

# Get all songs with 3+ annotations (songs with fewer rarely have quality bars)
songs=$(curl -s "https://api.genius.com/artists/$ARTIST_ID/songs?per_page=50&sort=popularity" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.response.songs[] | select(.annotation_count > 3) | .id')

total=$(echo "$songs" | wc -l | tr -d ' ')
echo "Songs with 3+ annotations: $total"
echo ""

count=0
for sid in $songs; do
  count=$((count + 1))
  echo -n "[$count/$total] Song $sid: "

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
  bars=$(grep -c "\"sid\":$sid" "$OUTPUT" 2>/dev/null || echo 0)
  echo "$bars quality bars"

  # Rate limit: 0.3s between requests
  sleep 0.3
done

echo ""
echo "=== DONE ==="
echo "Total quality bars: $(wc -l < "$OUTPUT")"
echo "Saved to: $OUTPUT"
