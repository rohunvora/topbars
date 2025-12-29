#!/bin/bash
# Scan annotation notes for quality keywords
# Usage: ./scan_notes.sh <song_id>

TOKEN="V8GNEnHfO3kFH7Z4KqIysAypK6kEe18TlXLiVvCaXd7G17BjnhPzGlRW840ChF0b"
QUALITY_REGEX="reference|metaphor|compar|slang|TV show|album|movie|video game|console|fictional|play on|double meaning|pun|entrepreneur|founder"

sid=$1
if [ -z "$sid" ]; then
  echo "Usage: $0 <song_id>"
  exit 1
fi

curl -s "https://api.genius.com/referents?song_id=$sid&per_page=50" \
  -H "Authorization: Bearer $TOKEN" | \
jq -r --arg regex "$QUALITY_REGEX" '
  def getText: 
    if type == "string" then . 
    elif type == "array" then map(getText) | join("") 
    elif type == "object" then if .children then .children | getText else "" end 
    else "" end;
  
  .response.referents[] | 
  . as $ref |
  ($ref.annotations[0].body.dom | getText) as $note |
  {
    lyric: $ref.fragment[0:60],
    votes: $ref.annotations[0].votes_total,
    note_len: ($note | length),
    has_quality_keyword: ($note | test($regex; "i")),
    note_preview: ($note[0:100])
  } |
  select(.votes > 0) |
  "\(.votes)v | kw:\(.has_quality_keyword) | \(.lyric[0:50])..."
'
