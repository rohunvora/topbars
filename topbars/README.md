# Bar Writer

Transform plain ideas into clever hip-hop style bars using AI.

## What This Does

You give it a plain statement like **"I'm tired"** and it returns clever bars like:

> **"Battery low like an iPhone, I need that charger, no cap."**
> **"Movin' like Garfield, all I want is sleep and no problems."**
> **"I'm so drained, even a vampire couldn't get a sip."**

The system prompt uses 15 wordplay techniques derived from curated hip-hop lyrics to generate bars with:
- Name/brand puns (Tom → MySpace)
- Product metaphors (PSP → portable)
- Pop culture references (Ferb → quiet)
- Sports wordplay (wide receiver → wide open)
- And more...

## Project Structure

```
bar-writer/
├── prompt/
│   └── bar-writer.md       # The system prompt (paste into any LLM)
├── reference/
│   ├── liked-bars.json     # Curated bars that define taste
│   ├── crawled-bars.jsonl  # Full library from crawled artists
│   └── annotations.txt     # Genius annotations for context
├── tools/
│   └── crawl-artist.sh     # Add more artists to reference library
├── test-bar-writer.ts      # Test suite (98 inputs across 14 categories)
└── archive/                # Old code (playlist-to-bars experiment)
```

## Quick Start

### 1. Use the Prompt Directly

Copy `prompt/bar-writer.md` and paste it as the system prompt in ChatGPT, Claude, or any LLM.

### 2. Run the Test Suite

```bash
# Add your OpenAI key to .env
echo "OPENAI_API_KEY=sk-..." > .env

# Run all 98 tests
npm run test
```

Results saved to `test-results/` as JSON and Markdown.

### 3. Add More Artists to Reference

```bash
# Set your Genius API token
export GENIUS_ACCESS_TOKEN=your_token

# Crawl an artist (see script for known IDs)
./tools/crawl-artist.sh 1476681 reference/yeat-bars.jsonl
```

## Roadmap

- [ ] **Expand reference library** — Crawl more artists to improve technique variety
- [ ] **Rate outputs UI** — HTML tool to mark which generated bars you like
- [ ] **Refine prompt** — Use feedback to improve technique selection

## How It Works

1. **Reference data** — Curated bars from Genius with annotations explaining *why* they work
2. **Technique extraction** — 15 categories of wordplay derived from the examples
3. **System prompt** — Teaches the LLM to apply these techniques to any input
4. **Test suite** — Validates output quality across edge cases

## Credits

Built on data from [Genius](https://genius.com) annotations.
