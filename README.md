# Seedbed

**English** · [Bahasa Indonesia](README.id.md)

An Obsidian plugin for incubating ideas and testing your understanding. An idea only moves up a stage after it passes a thinking "gate": **Socratic**, **Devil's Advocate**, or **Feynman**. The optional AI is only allowed to ask questions, never to answer them.

> **Status: v0.5.0 (pre-release).** Manually tested on Obsidian desktop (Windows 11). Not yet tested on mobile.

**Privacy and network.** With AI **off (the default)**, the plugin makes no network requests and runs no external programs. All data is plain Markdown frontmatter and callouts in your vault, so it stays readable without the plugin. AI only runs after you turn it on and approve each provider (see [Optional AI](#optional-ai)).

## Contents
- [Concept](#concept)
- [Commands](#commands)
- [Data format](#data-format)
- [Feynman mode](#feynman-mode)
- [Custom question bank](#custom-question-bank)
- [Optional AI](#optional-ai)
- [Language](#language)
- [Installation](#installation)
- [Development](#development)
- [Releasing](#releasing)
- [License](#license)

## Concept

```
Seed --(Socratic / Feynman)--> Growing --(Devil's Advocate)--> Mature
  \_______________ Discarded (any time) _______________/     Mature --> Growing (reopen)
```

| Type | seed → growing | growing → mature |
|---|---|---|
| idea (`ide`) | **Socratic** gate (6 questions) | **Devil's Advocate** gate (at least 4 of 5 answered) |
| concept (`konsep`) | **Feynman** gate (no unexplained terms) | Devil's Advocate optional (setting) |

- Every gate can be switched off in Settings; then a stage change takes one click.
- Every stage has a review date. Due ideas show up again in the Incubator panel, so nothing gets forgotten.

## Commands

| Command (Command Palette) | What it does |
|---|---|
| Capture new idea | Create an idea note from a template in the `Ide/` folder |
| Make this note an idea / a concept | Add `bengkel-*` properties to an existing note |
| Promote this idea | Move up one stage; opens the required gate |
| Challenge this idea (Devil's Advocate) | 5 challenging questions on any note; answers are saved as a callout |
| Start Feynman | Create a `Feynman - <Concept>` note (type concept) in the `Konsep/` folder |
| Check explanation (Feynman) | Find unexplained terms and overly long sentences |
| Open Incubator | Side panel: due items first, then grouped by stage |
| Open Feynman gaps panel | List of gaps found in the current explanation |

The Incubator panel has **Promote / Snooze / Discard / Open** buttons, plus **Reopen / Restore**. On desktop a "💡 N due" badge appears in the status bar; on mobile the badge is in the panel.

## Data format

Frontmatter is the source of truth for status. The `bengkel-` prefix avoids clashes with other plugins. Property values are kept in Indonesian for every UI language, so queries stay stable:

```yaml
---
bengkel-tipe: ide            # ide (idea) | konsep (concept)
bengkel-status: tumbuh       # benih (seed) | tumbuh (growing) | matang (mature) | dibuang (discarded)
bengkel-dibuat: 2026-11-11   # created
bengkel-tinjau: 2026-11-25   # next review date
bengkel-gerbang:             # gates already passed
  - socratic
---
```

Your thinking trail is stored as callouts that are only appended to the end of the note, including the source label of each question:

```markdown
> [!socratic]- Socratic session — 2026-11-12
> **Clarification** · AI · cloud (claude cli)
> Faster compared to what? Where does the data come from without a cache?
> Answer: Compared to fetching it from the database.
```

The plugin **never deletes note content**. It only appends callouts and edits properties that start with `bengkel-`.

Example Dataview query:

````markdown
```dataview
TABLE bengkel-status, bengkel-tinjau FROM "Ide" WHERE bengkel-tipe = "ide"
```
````

## Feynman mode

1. Terms = titles and aliases of all vault notes (min. 3 letters) + your jargon list from Settings.
2. A term that **appears** in your explanation counts as **explained** when it matches a definition pattern: `term is / means / refers to` (Indonesian: `adalah / yaitu / ialah / artinya / berarti / merupakan`).
3. Code blocks, inline code, frontmatter, HTML comments, link targets, and the plugin's own callouts are skipped.
4. Sentences longer than 25 words are flagged as **suggestions** (they don't block the gate).

This is pattern matching, not understanding. Expect false positives; use **Ignore** (per note) or tune the jargon list. The check reads the note as **saved on disk**.

## Custom question bank

Set **Settings → Custom bank file** to the path of a JSON file in your vault. Partial files are fine; empty categories fall back to the built-in bank:

```json
{
  "en": { "socratic": { "bukti": ["What is your own question?"] }, "devil": { "kegagalan": ["..."] } },
  "id": { "socratic": { "klarifikasi": ["..."] } }
}
```

Socratic categories: `klarifikasi` (clarification), `asumsi` (assumptions), `bukti` (evidence), `sudutPandang` (viewpoints), `implikasi` (implications), `pertanyaan` (the question itself). Devil's Advocate categories: `asumsi` (assumptions), `kebalikan` (opposite), `bukti` (evidence), `lawan` (opponents), `kegagalan` (failure).

## Optional AI

AI is used **only to ask questions**: Socratic and Devil's Advocate questions that refer to your note and your previous answers. AI **does not explain, does not answer, and does not grade the gates**. Passing a gate is still decided by fixed rules (answer length / number of answers). Every question carries a source label: `AI · local (ollama)`, `AI · cloud (claude cli)`, or `Bank`.

**Off by default.** Turn it on in Settings → AI (optional), then enable and approve each provider one by one. Providers are tried in order (configurable). If one fails or times out, the plugin moves to the next one, and finally to the built-in question bank.

| Provider | What happens | Does data leave your computer? |
|---|---|---|
| **Subscription CLI** (Claude Code) | Runs the `claude` program you are already signed in to. Desktop only. | **Yes** (cloud): the open note |
| **Local model** (Ollama, LM Studio) | Requests to a server on your machine (`localhost`). The plugin installs nothing. | No |
| **API** (OpenAI-compatible) | Requests to the URL you enter, with your API key. | **Yes** (cloud), unless the URL is localhost |

**What is sent:** only the open note (trimmed to the context limit, 4,000 characters by default), your earlier answers in that session, and the plugin's instructions. No other notes, no telemetry.

**CLI safety** (only when the CLI is enabled and approved):
- `claude` runs **without a shell** with fixed arguments: `-p --tools "" --permission-mode dontAsk --permission-prompts none --no-session-persistence --safe-mode --strict-mcp-config --disable-slash-commands --output-format json`. All tools (file read/write, shell, web) are **disabled**, no permission prompts appear, and no session is saved.
- The note is passed via **stdin**, never as an argument. The working directory is an **empty temp folder** that is deleted afterwards, not your vault.
- A hard timeout applies; the process is killed if it runs over. Output is only used as question text after it passes a validator, and is never executed.
- The plugin **never reads login or token files** of any provider.
- **Codex CLI and Gemini CLI are not supported yet**, because there is no verified way to disable all of their tools.
- Prompt injection inside a note can still be attempted. The plugin wraps the note as data, disables all tools, and rejects any output that isn't a question.

**API key warning:** the key is stored in `data.json` as **plain text** and syncs with your vault if you sync it.

**Socratic modes:**
- *Adaptive* (default): one question per step, built on your previous answer. The next question is prepared in the background when you stop typing.
- *One shot*: all 6 questions are generated at the start.

**Active learning by design:** Next only unlocks when your answer is long enough, and there is no "show answer" button. **Give a hint** (max. 2 per question) nudges your thinking without giving the answer. **This question is wrong** flags a question, and the flag is saved in the callout.

**Subscription quota:** each adaptive Socratic question = 1 call; Devil's Advocate = 1 call for all 5 questions; each hint = 1 call. Settings shows the call count for the current session. Check each provider's terms of service before use.

## Language

The UI and question bank are available in English and Bahasa Indonesia (Settings → Language). Command names in the Command Palette change after the plugin reloads.

## Installation

Not yet available in Community Plugins. To install manually:

1. Download `main.js`, `manifest.json`, and `styles.css` from the Releases page.
2. Copy them to `<vault>/.obsidian/plugins/seedbed/`.
3. Enable the plugin in **Settings → Community plugins**.

## Development

```bash
npm install
npm test                    # Vitest: domain logic (no Obsidian needed)
npm run build               # tsc + esbuild -> main.js
npm run dev                 # esbuild watch
npm run test:live           # real test with the actual claude CLI (uses quota, max. 3 calls)
npm run check-integrity     # compare test-vault against its snapshot
npm run gen-test-vault      # create test-vault/ (~22 sample notes)
npm run install-test-vault  # copy the build into test-vault/.obsidian/plugins/seedbed
```

Open the `test-vault/` folder in Obsidian (**Open folder as vault**) and enable the plugin. Don't test in your main vault.

Layout:
- `src/domain`: pure logic, no `obsidian` imports
- `src/adapter`: vault, frontmatter, cache, AI providers
- `src/ui`: panels, modals, settings
- `src/i18n`: English and Indonesian strings
- `tests/`: unit and integration tests

## Releasing

1. Fill in `author` in `manifest.json` and the name in `LICENSE`.
2. Bump the version: `npm version patch` (or `minor`/`major`). The `version` script updates `manifest.json` and `versions.json`.
3. `git push --follow-tags`. The `.github/workflows/release.yml` workflow tests, builds, and creates a **draft release**. The tag must match `version` exactly (no `v` prefix).
4. Review the draft on GitHub, then publish it.
5. First release only: open a PR to `obsidianmd/obsidian-releases`. Re-read the latest guidelines first, because this plugin runs programs and uses the network when AI is on.

## License

0-BSD.
