# Example session: "Cache for the product list"

Note `Ideas/Cache for the product list.md` has `status: seed`. Today is 2026-11-12.

**User:** test this idea Socratically

**Agent:** Six questions, one at a time. Answer in your own words, at least a sentence each; ask me for a hint if you are stuck.
**Clarification** (1 of 6): Give one concrete example of this idea working. What would it look like?

**User:** A shop page loads the product list from memory in 50 ms instead of asking the database every time.

**Agent:** **Assumptions** (2 of 6): What are you assuming is true for this to work?

**User:** Just explain what I should assume.

**Agent:** I will not hand you the answer, but here is a hint: think about how often the product data changes. What are you assuming about that?

**User:** That prices change rarely, maybe once a day, so old data is fine for a few minutes.

**Agent:** **Evidence** (3 of 6): What evidence or experience makes you believe this is worth pursuing?

(... questions 3 to 6 continue the same way, one per turn ...)

**Agent (after the 6th answer):** All 6 questions are answered, each with at least 20 characters, so the gate passes. I would append this to the note and change these properties:

```yaml
status: seed -> growing
gates: [] -> [socratic]
review: 2026-11-19 -> 2026-11-26
```

```markdown
> [!socratic]- Socratic session — 2026-11-12
> **Clarification** · AI · skill (Claude Code)
> Give one concrete example of this idea working. What would it look like?
> Answer: A shop page loads the product list from memory in 50 ms instead of asking the database every time.
>
> **Assumptions** · AI · skill (Claude Code)
> What are you assuming is true for this to work?
> Answer: That prices change rarely, maybe once a day, so old data is fine for a few minutes.
> ...
```

Save this?

## What this example shows
- The agent never explains caching and never says an answer is right or wrong.
- The hint points a direction ("how often the data changes") and gives no answer.
- Answers are saved word for word. The pass decision is only the count and the 20 characters.
