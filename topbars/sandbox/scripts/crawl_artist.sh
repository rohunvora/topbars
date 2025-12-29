#!/bin/bash
# Crawl all songs from an artist and score bars
# Usage: ./crawl_artist.sh <artist_id> <output_file>

TOKEN="V8GNEnHfO3kFH7Z4KqIysAypK6kEe18TlXLiVvCaXd7G17BjnhPzGlRW840ChF0b"
ARTIST_ID=${1:-3270750}  # Default: OsamaSon
OUTPUT=${2:-/tmp/crawl_output.jsonl}

echo "=== CRAWLING ARTIST $ARTIST_ID ==="
> "$OUTPUT"

# Get all songs with annotations
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
  
  # Fetch and score
  curl -s "https://api.genius.com/referents?song_id=$sid&per_page=50" \
    -H "Authorization: Bearer $TOKEN" | \
  jq -c --arg sid "$sid" '
    def getText: if type == "string" then . elif type == "array" then map(getText) | join("") elif type == "object" then if .children then .children | getText else "" end else "" end;
    
    .response.referents[] | 
    . as $ref |
    ($ref.annotations[0].body.dom | getText) as $note |
    ($note | length) as $len |
    
    (
      (if $ref.classification == "accepted" then 50 else 0 end) +
      (if $len > 500 then 40 elif $len > 300 then 25 elif $len > 100 then 10 else 0 end) +
      (if $note | test("reference|metaphor|compar|television|album|movie|fictional|pun"; "i") then 20 else 0 end) +
      ($ref.annotations[0].votes_total * 0.5 | floor)
    ) as $score |
    
    select($score >= 50) |
    {
      sid: ($sid | tonumber),
      lyric: ($ref.fragment | gsub("\n"; " / "))[0:80],
      score: $score,
      note_len: $len,
      votes: $ref.annotations[0].votes_total,
      acc: ($ref.classification == "accepted")
    }
  ' >> "$OUTPUT" 2>/dev/null
  
  bars=$(grep -c "\"sid\":$sid" "$OUTPUT" 2>/dev/null || echo 0)
  echo "$bars quality bars"
  
  sleep 0.3
done

echo ""
echo "=== DONE ==="
echo "Total quality bars: $(wc -l < "$OUTPUT")"
echo "Saved to: $OUTPUT"
