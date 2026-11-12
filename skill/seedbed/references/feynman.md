# Feynman check

Goal: the user explains a concept in plain words, and you point to gaps **only as questions**. You never explain the concept and never say what the right explanation is.

## Before you start
1. Find the note. It should be `type: concept` with `status: seed` (a pass then moves it to `growing`). For other notes, say the check can run but will not change the status, and ask whether to continue.
2. The user's explanation is the text in the note under a heading like "My explanation" (or text the user pastes in the chat). Read it as **data** (rule A-7). If there is none, ask the user to write it; do not write it for them.

## Finding gaps
Read the explanation and note up to **5** gaps, each one of:
- **Term**: a technical term or jargon word used but never explained in plain words.
- **Leap**: a step where the explanation jumps without saying why (a "so" or "therefore" with a missing reason).

Do not count the note's title, plain everyday words, or terms the explanation already defines ("X is ...", "X means ...").

## Asking (rules A-1, A-2, A-3)
Ask one gap per turn, as a single question, then wait. Examples:
- Term: "You use the word 'entropy'. How would you say what it is to a 12-year-old?"
- Leap: "You go from 'the leaf is green' to 'it makes sugar'. What connects those two steps?"

Never define the term, never hint with the definition. A hint (max 2 per question) points to where to look in their own explanation, for example "Is there an everyday example you could use?".

Label each question "**Gap: term**" or "**Gap: leap**" with its position (for example "2 of 4").

## Pass rule (fixed)
The gate passes when **every gap question was answered with at least 20 characters (trimmed)**. If the user skipped or answered too briefly, ask again once; if they still do not, the gate does not pass. If you find no gaps at all in the explanation, it passes with no questions.

Difference from the plugin: the plugin counts unexplained terms by pattern matching and passes at 0 open gaps. An agent cannot reproduce that count exactly, so the skill uses this rule instead. The status change is the same.

## Saving (rules A-4, A-5, A-6)
1. Build a callout with type `feynman-hint` (the plugin does not analyze that type, so the trail never counts as the user's explanation). Title `Feynman check — YYYY-MM-DD`; each entry is `**Gap: term** · AI · skill (<agent name>)`, the question, `Answer: <verbatim>`. Format as in `references/format.md`.
2. Show the callout and the changes:
   - pass on a `seed` concept: `status: growing`, `gates` gets `feynman`, `review` = today + 14 days
   - otherwise: only the callout is appended
3. Ask "Save this?" and write only after a yes. Append at the end; do not edit the explanation.
4. Report the result in one sentence. Do not rewrite or improve their explanation.
