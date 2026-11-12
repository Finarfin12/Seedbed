# Seedbed format (version 1)

Shared with the Seedbed Obsidian plugin 0.7.0. The plugin's behavior is authoritative.

## A Seedbed note
A Markdown file whose frontmatter has `type: idea` or `type: concept`. Any other note is not Seedbed's: never list it, never write to it.

## Properties
| Property | Required | Values |
|---|---|---|
| `type` | yes | `idea` or `concept` |
| `status` | yes | `seed`, `growing`, `mature`, `discarded` (anything else makes the note "invalid") |
| `created` | yes | `YYYY-MM-DD` |
| `review` | yes (not for `discarded`) | `YYYY-MM-DD`, next review date |
| `gates` | no | list of `socratic`, `devil`, `feynman`, no duplicates |
| `source` | no | http/https URL |
| `origin` | no | text, for example `capture` or `skill` |

Never touch other properties (`tags`, `author`, ...). Do not write the old formats (`bengkel-*`, `seedbed-*`). If `.seedbed.json` maps custom property names, use those names instead.

## Status and review dates
`seed` to `growing` needs the Socratic gate for an `idea`. When status changes, `review` = today + interval: seed 7 days, growing 14, mature 30. A note is due when `review` is today or earlier (or empty, unless `discarded`).

## Socratic pass rule (fixed, not your judgment)
All 6 categories answered and each answer is at least 20 characters after trimming. Otherwise the gate does not pass and the status stays `seed`.

Categories, in this order, with the label to write: Clarification, Assumptions, Evidence, Viewpoints, Implications, Question about the question.

## Devil's Advocate pass rule
At least 4 of the 5 questions answered (not empty after trimming). Labels, in order: Assumptions, Opposite, Evidence, Opponent, Failure. A pass adds `devil` to `gates`; on a `growing` note it also sets `status: mature` and `review` = today + 30 days. A `seed` note is never promoted by it. For a `concept` the gate is optional.

## Feynman pass rule (skill version)
Every gap question answered with at least 20 characters (trimmed), or no gaps found. The plugin counts unexplained terms by pattern at 0 open gaps; the status change is the same: a `seed` concept becomes `growing`, `gates` gets `feynman`, `review` = today + 14 days. The trail uses a `[!feynman-hint]-` callout (title `Feynman check — date`), which the plugin does not analyze.

## Callout (the thinking trail)
Always **append at the end** of the note after one blank line. Never edit or delete existing text.

```markdown
> [!socratic]- Socratic session — 2026-11-12
> **Clarification** · AI · skill (Claude Code)
> What does "faster" mean here, and compared to what?
> Answer: <the user's words, exactly>
>
> **Assumptions** · AI · skill (Claude Code)
> ...
```

- Every line starts with `> `; an empty line inside is just `>`.
- Answer line: `Answer: ` followed by the first line of the answer; further answer lines just start with `> `.
- If an answer line starts with `[!`, write `\[!` so it cannot start a new callout.
- Source label: `AI · skill (<agent name>)`.

## New note files
Remove `\ / : * ? " < > | # ^ [ ]` from the title, cut to 80 characters, add a number if the name exists (`Title 2.md`). Never overwrite.
