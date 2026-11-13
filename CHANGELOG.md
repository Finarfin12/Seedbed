# Changelog

## 0.8.3
- Move Seedbed Capture into its own repository, retaining its history and parity tests.
- Clean up scanner warnings, add lint checks and release attestations.
- Protect provider errors from exposing credentials; preserve legacy CLI error formatting.
- Defer declarative setting definitions because they require a newer Obsidian API than 1.8.7. Two sanitized-error exceptions and one legacy-format exception remain intentional.

## 0.8.2
- Interop only: the Feynman analyzer skips the text of `[!evidence]` callouts, the trail written by the agent skill's new evidence mode (skill 0.4.0), so quotes and answers in them neither create gaps nor count as an explanation. No new command, setting, UI or network use; evidence mode is a skill feature, not a plugin feature.

## 0.8.1
- Fixes for the Obsidian community plugin review: views are no longer detached in `onunload` (they keep the place you moved them to), `minAppVersion` raised to 1.8.7 because the plugin uses `getLanguage()`, and the `eslint-disable` comments now say why they are needed.
- `versions.json` corrected: 0.5.0, 0.7.0 and 0.8.0 also need Obsidian 1.8.7 (they call `getLanguage()`); entries for versions that were never released (0.4.0, 0.6.0) removed.
- Release check (`scripts/check-release.mjs`, run in CI and before every release): the tag, `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and `CHANGELOG.md` must agree on the version, or the build fails. Release notes now contain only this version's CHANGELOG section.

## 0.8.0
- **Format v2** (shared with the agent skill, see README "Format v2"): `gates` keeps unknown values such as `premortem` when the plugin rewrites it (0.7.0 dropped them); new callouts `[!premortem]`, `[!retrieval]`, `[!connect]`; a line of callout content that starts with `[!` is now written as `\[!` (the format already required it, the plugin did not do it).
- **Pre-mortem** (new command and Incubator button for mature ideas, optional, on by default): 5 questions, passes with 3 answers of 20+ characters, adds `premortem` to `gates`, never changes the status.
- **Recall** (retrieval practice): for due notes that have earlier answers, your answer comes first and the earlier answer is revealed only after you submit (kept by code, not CSS). Optional self-rating (Remembered / Partly / Forgot) moves the next review (÷2 / ×1.5). With "adjust review" turned off, Recall never changes `review`. No scores, no right/wrong.
- **Stuck** section in the Incubator and **Create weekly digest** command (`Seedbed digest YYYY-MM-DD.md`, never overwrites). "Stuck" = the file was not edited for more than 30 days (file modified time; any edit or sync resets it). Optional weekly reminder (off by default).
- **Connect**: asks how an idea relates to your other Seedbed ideas (only `type: idea/concept` notes are ever read). A `[[link]]` is added only after you press its button.
- **Feynman**: definitions that are circular or empty are flagged; plugin and extension callouts are not analysed.
- **AI (still off by default; AI only asks)**: tailored pre-mortem questions, Connect questions (sends the title and first 300 characters of up to 10 other Seedbed notes), one question under the digest suggestion, and "Ask a follow-up" (max 2 per gap) in the Feynman gaps panel. With AI off nothing is sent and nothing is run.
- Fixes found while testing: similarity ignores frontmatter and words every Seedbed note shares.

## 0.7.0
- **License changed to MIT** (was 0-BSD): `LICENSE`, `package.json`, and the README now say MIT, copyright (c) 2026 Finarfin12. The same change applies to Seedbed Capture.
- **Note properties are now plain English names without a prefix, for every UI language:** `type: idea | concept`, `status: seed | growing | mature | discarded`, `created`, `review`, `gates`, `source`, `origin`. The capture callout `[!pemicu]` is now `[!trigger]` (`[!socratic]` and `[!devil]` are unchanged). Dates stay `YYYY-MM-DD`.
- **Property names are configurable** (Settings → Property names) to match your own templates. Values stay fixed.
- **Ownership rule:** because the names are common, a note belongs to Seedbed only when its `type` is `idea` or `concept`. Other notes (`status: done`, `type: book`, `created`, ...) are ignored completely: not shown, not marked invalid, never written. "Make this note an idea" refuses to overwrite an existing `type`/`status`.
- **Backward compatible:** 0.6 notes (`bengkel-*`, Indonesian values) and 0.7 development notes (`seedbed-*`) are still read, also mixed; old `[!pemicu]` callouts keep their style. When the plugin writes to an old note it converts that note's own old properties in the same edit.
- New command **Migrate Seedbed properties**: converts all old notes after a confirmation that shows the number of notes. It never overwrites: a note whose target property already holds a different value is skipped and listed in the result. Only old Seedbed properties change, never note content; safe to run again.
- Captures from the browser (`obsidian://seedbed-capture`) create notes in the new format.
- **Obsidian templates, on request:** `Seedbed Idea.md` and `Seedbed Concept.md` (your property names, plugin language, Feynman hints for concepts) can be created in the templates folder (Settings → Templates, else the core Templates folder, else `Templates/`). The plugin asks once (Create / Later) the first time it runs, there is a command **Create Seedbed templates** and a Settings button, and existing files are never overwritten.
- **Empty dates fill themselves in:** a `type: idea/concept` note whose `created` or `review` is empty (for example just made from a template) gets `created` = today and `review` = today plus the status interval. Only empty Seedbed properties are touched; guarded against write loops.
- README: ready-to-use Obsidian templates for ideas and concepts, a Dataview example, and "Upgrading from 0.6". If you have your own Dataview queries or templates using `bengkel-*`, update them.

## 0.6.0
- Seedbed Capture handler `obsidian://seedbed-capture`: validated, escaped, confirmation on by default, "N seeds not reviewed yet" notice.
- Devil's Advocate modal height limit with sticky footer; Feynman gaps panel title and auto-refresh.

## 0.5.0
- Renamed to **Seedbed** (was "Bengkel Ide"). Note properties keep the `bengkel-` prefix so existing notes keep working.
- Optional AI (off by default): Socratic and Devil's Advocate questions tailored to the open note. The AI only asks; gates stay rule-based.
- Providers: subscription CLI (Claude Code only), local model (Ollama / LM Studio), OpenAI-compatible API, with fallback to the built-in question bank.
- Hints, "question is wrong" flag, prefetch, source label on every question.

## 0.4.0
- Incubator panel, Socratic / Devil's Advocate / Feynman gates, ID/EN interface.
