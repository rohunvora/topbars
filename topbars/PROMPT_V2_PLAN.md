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

**Primary use case:** Transforming real messages/tweets/DMs/captions before sending them. Not generating "rap bars" but making everyday communication wittier and more propositionally dense.

**What "better" means:**
- Least words possible to convey most meaning
- Feels effortless/natural/not trying too hard
- Unexpected connections, multiple meanings, pop culture analogies
- Should surprise the user with connections they wouldn't have made

**Smart transformation (key insight):**
The system should be "smart" enough to:
1. First assess if the concept/idea is clear
2. If clear → extrapolate and enhance with wit
3. If unclear → clarify while also making it sharper
4. Always respect user's wish for a rewrite (user decides if original is better)

**Critical insight on simplicity:**
Sometimes the simple original IS better than any rewrite. "im tired" is probably better than 99% of clever rewrites. The system should recognize this implicitly - generic/mundane inputs often don't benefit from wordplay. Real value comes from enhancing inputs that have actual substance.

**What to avoid:**
- Over-explaining the joke
- Forced/unnatural references
- Wrong rhythm/cadence
- Generic/safe references everyone uses
- Structural monotony
- Rewrites that lose the original's authenticity

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
- Swapa (user-specified)
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
- Each variation MUST be meaningfully different (not just structurally)
  - Current problem: "all 3 suck" and feel samey
  - Goal: Each should feel like an interesting choice between genuinely different approaches
  - Different technique, different reference domain, different tone
- Explanations toggleable (default: off for production, on for testing)
- Keep artist references abstract (qualities not names)
- System always attempts rewrite - user decides if original is better

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

**4.3 Include user's actual examples (FULL TEXT)**

**Example 1 - Market tweet (already has some wit):**
```
Market feels like 2021/22 on repeat except the big orange elephant in the white house

i think the orange elephant will still find a way to send the market throughout the rest of his term
```

**Example 2 - Telegram group message (longer form, needs line-by-line):**
```
if ur still here, gg. ur here for a reason.

if you havent contributed much recently, it means you have potential. and the group has high expectations for you.

at bottom of post-april bear this group got down to 65 people.

stay focused and clear headed. opportunities will continue to present themselves but most people will lose money on random noise.

looking forward to navigate this shit ass fuck market with yall.
```
*Note: For longer inputs like this, system should go line-by-line to find enhancement opportunities while leaving some lines unchanged.*

**Example 3 - Conspiracy tweet (colloquial, could use punch):**
```
i swear my biggest conspiracy is everytime u try a new perp dex they feed u wins then they hunt u until u lose everything
```

**Example 4 - Informative tweet (flat, needs swagger):**
```
pretty rare these days to find a prompt you copy paste and it magically makes everything better

recently saw @trq212 post something and after playing with it, it's best new concept i've seen in a while, the idea of forcing claude to ask you as many follow ups as possible
```

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

*(Note: Question about "don't change this" was answered - system always attempts rewrite, user decides if original is better)*

---

## Files to Modify

- `prompt/bar-writer.md` - Complete rewrite
- `reference/liked-bars.json` - Curate down
- `test-bar-writer.ts` - New test inputs
- `tools/crawl-artist.sh` - Add new artist IDs
- NEW: `reference/negative-examples.json` - Bad outputs to avoid

---

## Appendix: Raw Interview Insights

Captured verbatim from user for reference:

| Topic | User Response |
|-------|---------------|
| Use case | "paste in things about to send as a message, or post as a tweet, hope it makes output better than what I originally wrote" |
| Transformation | "smart - figure out if concept is clear first, extrapolate on top if so, clarify while being wittier if not" |
| Voice | "not about storing what I write like - focus on making output as propositionally dense/witty/sharp as possible" |
| Density | "least words possible to convey most meaning... craft is doing it where it feels effortless/natural/not trying too hard" |
| AI smell | "all of the above" (too explanatory, forced refs, wrong cadence) |
| Techniques | "don't hate this, but worry it's overindexed and forces fits where they might not belong" |
| Output count | "3 is max. Ideally unique enough where it's an interesting choice. My experience so far is they all 3 suck" |
| Explanations | "optional/toggleable" |
| Simple inputs | "'im tired' is probably better than 99% of rewrites" |
| Real inputs | "DMs, replies, captions, tweets, thoughts, opinions" |
| Pass option | "user can decide if better - always respect user's wishes (which is a rewrite)" |
| Annotations | "run a pass to make more system prompt example friendly (not 'summarize' but refine)" |
| Anti-examples | "yes, show what to avoid - use AI outputs that suck" |
| Example count | "depends on quality - only keep the best, cut ruthlessly" |
| Artist naming | "keep abstract - focus on qualities not names" |
| New artists | "Frank Ocean, Drake, BabyTron, Bo Burnham, Jean Dawson, Lil B, Swapa, Brockhampton" |
| Success | "I'll know it when I see it" |

---

*Plan created 2025-12-29 based on user interview.*
