# Seedbed 0.9.0 GUI QA (isolated Obsidian 1.15.1 profile + temp vault, synthetic notes)

- **M6-AI-off**: PASS — AI off: model/status rows hidden=true; external requests=0
- **M1-Claude**: PASS — status="Connected · 32 models available", options=35, first=["(provider default)","fable","opus","sonnet","claude-sonnet-5-5","claude-opus-5-5"]
- **M2-Codex**: PASS — status="Connected · 10 models available · Detect only — not yet supported for running questions", options=13, first=["(provider default)","gpt-6.1-terra","gpt-6.2-sol","gpt-6.2-astra"], notices=["💡 10 ideas are due for review.","Tidak didukung untuk menjalankan pertanyaan: `codex exec --help` (0.16
- **M3-Gemini**: PASS — status="Not connected · Unavailable", dropdown disabled=true, placeholder="— No models detected —"
- **M7-Antigravity**: PASS — status="Connected · 23 models available · Detect only — not yet supported for running questions", options=26, names shown=["(provider default)","Gemini 4 Neon (High)","Gemini 4 Neon (XHigh)","Gemini 4 Neon (Medium)"], notices=["Tidak didukung untuk menjalankan pertanyaan: Gemini CLI tidak terpasang 
- **M7-save-id**: PASS — saved model id = "claude-opus-5-5-high"
- **S8-GUI-manual-invalid**: PASS — saved="claude-opus-5-5-high", notice=["Tidak didukung untuk menjalankan pertanyaan: `agy --help` (1.5.14) tidak punya flag yang mematikan semua tool (`--sandbox` hanya membatasi terminal, `--mode plan` bukan tool-off, kunci `--settings` tidak terdokumentasi) (aturan keamanan §7.3). Deteksi dan dafta
- **M4-API-no-key**: PASS — status="Not connected · API key required", requests to api.example.com=0
- **M4-local**: PASS — local status rows: ["Connected · 32 models available","Not connected · Unavailable","Not connected · Unavailable"] (Ollama/LM Studio servers are not running on this PC)
- **M5-check-notice**: PASS — notices=["Connected to Antigravity CLI (23 models detected)","Connected to Claude Code (32 models detected)","Invalid model name: letters, digits and . _ : - / only","api.example.com is not connected (API key required)"]
- **M1-socratic**: SEE-LIVE-TEST — One real Socratic session through Claude Code was run by `npm run test:live` (3 real CLI calls incl. injection checks, all passed) on the rebuilt runner; the GUI run only verified the settings screen.
- **Console-errors**: PASS — console errors: 0 []
- **M6-AI-off-after**: PASS — AI turned off again: external requests=0

Screenshots: `qa/0.9.0/screenshots/`. Not run: Ollama / LM Studio with a running server (not running on this PC), API with a valid key (no key used), mobile.
