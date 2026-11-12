# Chrome Web Store listing: English (primary)

Fill the **Store listing** tab with the texts below. Limits come from the official docs (see `SUBMISSION-CHECKLIST.md`, "Sources").

## Name
`Seedbed Capture` (15 characters; comes from `_locales/en/messages.json`, not typed in the dashboard).

## Summary (the manifest `description`, max 132 characters)
`Save selected text as a seed in Seedbed (Obsidian) with a trigger question. No server, no network.` — 98 characters, already in `_locales/en/messages.json`. Nothing to type; the dashboard reads it from the ZIP.

## Detailed description (paste into "Description"; the docs state no character limit)

Seedbed Capture turns a passage you read into a seed for your own thinking, not a clipping.

Select text on any web page, then right-click "Save as seed" (or press Alt+Shift+S). A small window shows the quote and a trigger question, such as "What does this remind you of?". Change the question if you like, optionally write one sentence in answer, and save. The seed lands in your Obsidian vault as a note with its source link, ready for the Seedbed Incubator.

How it differs from a web clipper
• A clipper keeps what you read. Seedbed Capture keeps what you think about what you read: quote + trigger question + your one-sentence answer.
• A daily seed limit (5 by default) nudges you to review seeds before piling up more. You can change it or turn it off.
• Long selections are shortened with a visible marker, never silently.

What you need
• Obsidian on the same computer (desktop).
• The Seedbed plugin, version 0.7.0 or newer, for the full flow (seeds show up in the Seedbed Incubator and move through its gates). Seedbed is not in Obsidian's Community Plugins yet: for now you install it manually from its GitHub page (github.com/Finarfin12/Seedbed, see the README).
• No Seedbed? Switch the extension to "fallback mode": it creates a plain Obsidian note (with the same properties) using Obsidian's built-in link, so you can try the capture on its own.
• Chrome may ask once whether to open Obsidian.

Private by design
• No server, no account, no analytics, no network requests, no remote code.
• Selected text is passed to Obsidian only through a local obsidian:// link on your own computer.
• Minimal permissions: contextMenus, storage, activeTab, scripting. No access to all websites.
• English and Indonesian interface.

Seedbed Capture is an independent project and is not affiliated with Obsidian.

## Category (suggestion)
**Productivity.** The docs do not list the dashboard's category names; pick the closest under Productivity (for example a workflow/notes-related one) in the dropdown.

## Language
English (default). Add Indonesian as a second locale only if you also fill `listing-id.md`; the extension already ships `_locales/en` and `_locales/id`.

## Other fields (all optional per the docs)
- Homepage URL: your GitHub repository, if you make one public for the extension (`TODO-github-url`).
- Support URL: same, or an issues page.
- Official URL: only for verified publishers; skip.
- Mature content: off.
- Video: none.

## Graphics (in `images/`, see `images/README.md`)
- Store icon 128×128: from the ZIP (`icons/icon128.png`).
- Screenshots 1280×800 (up to 5): `images/en/screenshot-1…5.png`.
- Small promo tile 440×280: `images/promo-small-440x280.png`. Marquee 1400×560: not made (optional).
