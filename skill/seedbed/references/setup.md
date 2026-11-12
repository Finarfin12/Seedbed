# Setup

Creates `.seedbed.json` at the root of the notes folder so later sessions know where notes live. Optional: the skill works without it.

## Steps
1. Ask the user, one question per turn:
   - the notes folder for ideas (default `Ideas/`)
   - the folder for concepts (default `Concepts/`)
   - the language of the session (default: follow the user's language)
   - only if the user also uses the Seedbed plugin with custom property names: those names
2. Check whether `.seedbed.json` already exists at the root. **If it does, never overwrite it**: show its content, say it was left as is, and stop. Do not offer to replace it; say the user can edit the file by hand.
3. Show the file that would be created and ask "Create this?":

```json
{ "notesFolder": "Ideas", "conceptsFolder": "Concepts", "language": "auto", "properties": {} }
```

   `properties` stays `{}` for the default names. Custom names map the defaults, for example `{ "type": "kind", "status": "stage" }`.
4. Write it only after a yes. Create the folders only if the user asks.

## Using it
In every mode, read `.seedbed.json` first if it exists: `notesFolder` for new ideas (capture) and for review, `conceptsFolder` for concepts, `properties` for custom property names. If it is missing or unreadable, use the defaults and the folder the user names.
