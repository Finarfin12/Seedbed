# Privacy Policy: Seedbed Capture

Effective date: 2026-11-12 (version 0.2.0)
Developer / contact: TODO-your-name, TODO-contact-email

Seedbed Capture is a Chrome extension that saves text you select on a web page as a note ("seed") in your own Obsidian vault. This policy explains what the extension handles and where that data goes.

## Summary
- The extension has no server, no account, no analytics, no advertising, and makes no network requests.
- The text you select leaves the extension in one way only: a local `obsidian://` link that Chrome hands to the Obsidian app on your own computer.
- The developer receives none of your data.

## What the extension handles
When you start a capture (right-click "Save as seed", the keyboard shortcut, or the toolbar button), the extension handles:
1. The text you selected on the page.
2. The page's address (URL) and title, so the note can link back to the source.
3. A trigger question shown in the capture window, and an optional one-sentence answer you type.

It does not read the page unless you start a capture, and it does not read any other page content, cookies, passwords, forms, or browsing history.

## Where the data goes
- Chrome opens a local `obsidian://` link containing the items above. Obsidian, running on your computer, creates the note in the vault you named in the extension's options.
- What happens after that, including whether Obsidian or the Seedbed plugin syncs your vault, is controlled by those applications and your own settings, not by this extension.
- The extension does not send the data to any website, server, or third party.

## What the extension stores
- **Options** (vault name, language, mode, quote length, daily limit) and a **daily capture counter**, in `chrome.storage.local` on your device. They remain until you change them, clear the extension's data, or uninstall it.
- **The capture in progress**, in `chrome.storage.session` (temporary browser memory), only to pass it from the background to the capture window. It is deleted as soon as the window reads it. If you abandon a capture before the window opens, the data stays only in session memory until Chrome clears the session.
- There is no capture history, and nothing is synced through your Google account (`chrome.storage.sync` is not used).

## Permissions
- `contextMenus`: the "Save as seed" right-click item.
- `storage`: the options, counter, and in-progress capture described above.
- `activeTab`: temporary access to the current tab, only after you press the shortcut or toolbar button.
- `scripting`: reads your current text selection in the active tab after you press the shortcut or toolbar button. No other code is injected.

The extension requests no host permissions and has no content scripts.

## Sharing, selling, and advertising
The developer does not collect, sell, share, or transfer your data, and does not use it for advertising, profiling, or credit decisions. Nobody at the developer can read it, because it never reaches the developer.

## Remote code
The extension does not load or run remote code. All code ships inside the extension package.

## Limited Use disclosure
The use of information received from Chrome APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Children
The extension is a general productivity tool and is not directed to children.

## Changes
If this policy changes, the new version will be published at the same address with a new effective date.

## Contact
TODO-contact-email
