#!/bin/bash
# Quality score bars by annotation note length + keywords
# Usage: ./quality_score.sh <song_id>

TOKEN="V8GNEnHfO3kFH7Z4KqIysAypK6kEe18TlXLiVvCaXd7G17BjnhPzGlRW840ChF0b"

sid=$1
if [ -z "$sid" ]; then echo "Usage: $0 <song_id>"; exit 1; fi

curl -s "https://api.genius.com/referents?song_id=$sid&per_page=50" \
  -H "Authorization: Bearer $TOKEN" | \
jq -r '
  def getText: if type == "string" then . elif type == "array" then map(getText) | join("") elif type == "object" then if .children then .children | getText else "" end else "" end;
  
  .response.referents[] | 
  . as $ref |
  ($ref.annotations[0].body.dom | getText) as $note |
  ($note | length) as $len |
  
  # Quality score calculation
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
