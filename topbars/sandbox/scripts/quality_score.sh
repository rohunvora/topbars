#!/bin/bash
#
# quality_score.sh - Score all bars for a single Genius song
#
# USAGE:
#   ./quality_score.sh <song_id>
#
# EXAMPLE:
#   ./quality_score.sh 9615170
#
# OUTPUT:
#   Prints scored bars to stdout, sorted by score descending.
#   Only shows bars with score > 20.
#
# QUALITY SCORING:
#   +50 if acc:true (editor verified)
#   +40 if note > 500 chars
#   +25 if note > 300 chars
#   +10 if note > 100 chars
#   +20 if note contains quality keywords
#   +0.5 per vote
#

TOKEN="V8GNEnHfO3kFH7Z4KqIysAypK6kEe18TlXLiVvCaXd7G17BjnhPzGlRW840ChF0b"

sid=$1
if [ -z "$sid" ]; then
  echo "Usage: $0 <song_id>"
  echo "Example: $0 9615170"
  exit 1
fi

curl -s "https://api.genius.com/referents?song_id=$sid&per_page=50" \
  -H "Authorization: Bearer $TOKEN" | \
jq -r '
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
    (if $note | test("reference|metaphor|compar|television|album|movie|fictional|pun"; "i") then 20 else 0 end) +
    ($ref.annotations[0].votes_total * 0.5 | floor)
  ) as $score |

  {
    lyric: ($ref.fragment | gsub("\n"; " / "))[0:60],
    score: $score,
    note_len: $len,
    acc: ($ref.classification == "accepted"),
    votes: $ref.annotations[0].votes_total
  } |
  select(.score > 20)
' | jq -s 'sort_by(-.score) | .[] | "\(.score) pts | \(.note_len)ch | \(.votes)v | \(.lyric)..."'
