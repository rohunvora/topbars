# Bar Writer System Prompt v2 - Improvement Plan

Based on detailed interview conducted 2025-12-29.

---

## Core Problem Statement

The current system prompt produces outputs that:
- All follow the same structural pattern (setup, comma, conclusion)
- Feel generic/safe with obvious references (SpongeBob, Garfield, iPhone)
- Try too hard and lack effortless delivery
- Don't sound like something someone would actually say

**Root cause:** The multi-shot examples are AI-generated, creating a self-reinforcing loop of mediocrity. The prompt teaches structure from fake examples instead of extracting patterns from real lyrics.

---

## User Goals

**Primary use case:** Transforming real messages/tweets before sending them. Not generating "rap bars" but making everyday communication wittier and more propositionally dense.

**What "better" means:**
- Least words possible to convey most meaning
- Feels effortless/natural/not trying too hard
- Unexpected connections, multiple meanings, pop culture analogies
- Should surprise the user with connections they wouldn't have made

**What to avoid:**
- Over-explaining the joke
- Forced/unnatural references
- Wrong rhythm/cadence
- Generic/safe references everyone uses
- Structural monotony

---

## Action Plan

### Phase 1: Rebuild Reference Library

**1.1 Curate liked-bars.json**
- Review existing 24 bars - keep the strong ones, cut the weak
- User rates current curated output to identify what actually resonates
- Target: 15-20 definitive examples of user's taste

**1.2 Expand artist pool**
Add crawled bars from:
- Frank Ocean (poetic, layered)
- Drake (quotable, pop culture refs)
- BabyTron (dense Michigan-style references)
- Bo Burnham (comedy wordplay, meta humor)
- Jean Dawson (experimental, alternative)
- Lil B (based, stream of consciousness)
- Brockhampton (collective energy)
- Keep: Ken Carson, OsamaSon, Nettspend (current pool)

**1.3 Quality filter for crawled bars**
- Run all crawled bars through rating system
- Only promote bars that match user taste profile to reference set
- Goal: 50-100 high-quality real examples

---

### Phase 2: Rewrite System Prompt from Scratch

**2.1 Remove all AI-generated examples**
- Delete current multi-shot examples entirely
- Replace with REAL lyrics + cleaned annotations

**2.2 Restructure technique categories**
Current: 15 named techniques (may cause overfitting)

New approach:
- Keep technique names but make them secondary
- Lead with examples, derive technique labels after
- Reduce from 15 to ~8 core patterns that naturally emerge from liked bars
- Let examples speak rather than forcing categories

**2.3 Add structural variety to examples**
Ensure examples demonstrate:
- Short punchy (4-6 words, no comma)
- Question/answer format
- Punchline-first structure
- Name drop as closer
- Multiple clauses with varied connectors (not always comma)

**2.4 Add negative examples**
Source: AI outputs that suck from current test runs
Format:
```
DON'T:
"battery low like an iphone, i need that charger, im on one percent"
Why it fails: Too long, explains itself, generic reference, comma-comma structure

DO:
"i got paper like dunder"
Why it works: 6 words, unexpected reference, doesn't over-explain
```

**2.5 Refine annotation format**
- Take real Genius annotations
- Clean for system prompt friendliness (not "summarize" but refine)
- Keep authentic human voice
- Extract the insight without the fluff

---

### Phase 3: Update Prompt Guidelines

**3.1 Core instruction rewrite**
Current: "Transform plain ideas into clever, quotable bars"
New: Focus on propositional density - maximum meaning in minimum words

**3.2 Output format**
- Keep 3 variations max
- Each variation MUST be structurally different
- Explanations toggleable (default: off for production, on for testing)
- Keep artist references abstract (qualities not names)

**3.3 Add "effortlessness" instruction**
Explicit guidance:
- If it sounds like it's trying, it's wrong
- Clever should feel discovered, not constructed
- When in doubt, shorter is better

**3.4 Add line-by-line mode**
For longer inputs (like the Telegram message example):
- Process line by line
- Only enhance lines with clear opportunity
- Some lines should stay unchanged
- Output format shows which lines changed and why

---

### Phase 4: Rebuild Test Suite

**4.1 Remove weak test cases**
Cut generic inputs like "I'm tired", "I'm bored" that don't reflect real usage

**4.2 Add realistic test inputs**
Categories based on user's actual use cases:
- Market/trading commentary
- Group chat messages (longer form)
- Tweet-length observations
- Hot takes and opinions
- Replies and reactions

**4.3 Include user's actual examples**
Add the 4 real examples from interview:
1. "Market feels like 2021/22 on repeat except the big orange elephant..."
2. "if ur still here, gg. ur here for a reason..." (long form)
3. "i swear my biggest conspiracy is everytime u try a new perp dex..."
4. "pretty rare these days to find a prompt you copy paste..."

---

### Phase 5: Iteration Loop

**5.1 Test → Rate → Refine cycle**
1. Run test suite with new prompt
2. User rates outputs in viewer
3. Analyze patterns in liked vs disliked
4. Adjust prompt based on findings
5. Repeat

**5.2 Success criteria**
User-defined: "I'll know it when I see it"
Proxy metrics:
- Outputs are structurally varied
- At least one output per input feels usable
- Outputs surprise rather than bore
- No obvious "AI smell"

---

## Implementation Order

1. **Phase 1.1** - User curates liked-bars.json (needs user input)
2. **Phase 4.3** - Add real test inputs to suite
3. **Phase 2.1-2.3** - Rewrite prompt with real examples only
4. **Phase 2.4** - Add negative examples from current bad outputs
5. **Phase 3** - Update guidelines and instructions
6. **Phase 5** - Test and iterate
7. **Phase 1.2** - Expand artist pool (parallel track)

---

## Open Questions for User

1. Which bars from current liked-bars.json should definitely stay vs go?
2. Want to provide more real test inputs beyond the 4 examples?
3. Preferred temperature setting - current 0.9 might contribute to sameness at scale?
4. Should there be a "don't change this" option when original is already strong?

---

## Files to Modify

- `prompt/bar-writer.md` - Complete rewrite
- `reference/liked-bars.json` - Curate down
- `test-bar-writer.ts` - New test inputs
- `tools/crawl-artist.sh` - Add new artist IDs
- NEW: `reference/negative-examples.json` - Bad outputs to avoid

---

*Plan created 2025-12-29 based on user interview.*
