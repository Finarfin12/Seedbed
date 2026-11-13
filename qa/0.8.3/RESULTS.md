# Seedbed 0.8.3 Verification Results

- T-M1: PASS. Standalone repository `seedbed-capture`: 36 tests, build, check-bundle pass; CI green on `40421de`.
- T-M2: PASS. Subtree history has 3 earlier commits.
- T-M3: PASS. Modifying the control rule in parity fixture made tests fail; restoring it gave 36/36.
- T-M4: PASS. `git grep extension/` is empty outside historical CHANGELOG; README links to standalone repository.
- T-L1: PASS. ESLint: zero errors; one warning `prefer-setting-definitions` deferred for Obsidian 1.8.7. Two sanitized transport error suppressions and one legacy CLI formatting suppression are narrowly scoped.
- T-L2: PASS. Lint and test CI green on GitHub Actions.
- T-R1: PASS. 401/401 tests pass on Linux CI for head commit `f9cea1b9647ee89ac40809e1fb8f62c2bd0f3ab9`.
- T-R2: PASS. 44 character cases passed against 0.8.2 regex behavior.
- T-R3: PASS. GUI verification on isolated QA vault:
  - T-R3-Capture: PASS (`obsidian://seedbed-capture` creates seed note `Ide/Capture 083.md` after confirmation)
  - T-R3-Socratic: PASS (promoted to `status: growing` with `gates: [socratic]` and callout `[!socratic]`)
  - T-R3-Recall: PASS (retrieval review on due note `RT Jatuh tempo.md` updates review date and writes callout)
  - T-R3-Digest: PASS (weekly digest created in `Digests/Seedbed digest 2026-11-13.md`)
  - T-R3-AI-Disabled: PASS (`ai.enabled=false`, 0 external network requests during all interactions, no follow-up button)
  Screenshots captured in `qa/0.8.3/screenshots/`.
- T-R4: PASS. Debounce tests pass with fake timers; adapter tests pass in isolation.
- T-V1: PASS. Release 0.8.3 created and published as Latest with `main.js`, `manifest.json` (0.8.3), and `styles.css`.
- T-V2: PASS. GitHub Artifact Attestation generated and verified for all 3 release assets (Attestation ID: 67027996, Rekor logIndex: 3846401065).
- T-V3 & T-V4: BELUM TERVERIFIKASI (Pending crawler live). Halaman publik https://community.obsidian.md/plugins/seedbed saat diperiksa masih menampilkan data versi 0.8.2 (Review: Caution, 140 issues). Crawler pemindai Obsidian biasanya memperbarui data ±10–15 menit setelah rilis baru.

## Dependency Audit

Capture moved Vitest 3.2.7 to 5.1.0 with Vite 6.4.6; npm audit and npm audit --omit=dev returned zero. Plugin production audit: zero. Plugin dev audit: 12 moderate findings through two advisories. GHSA-g3hv-75wg-m249 (minimatch: glob amplification DoS) reaches typescript-eslint and eslint-plugin-obsidianmd via eslint-plugin-n. No patched 9.x or 10.x minimatch was listed at audit time; 11.0.8 is outside their dependency ranges. GHSA-4p3w-j4w9-5jqw (moment locale path traversal on crafted non-string input) comes through Obsidian type package. These are development dependencies, not direct evidence of runtime vulnerability; scanner/lint input and dev environment remain exposed. Obsidian types are pinned to 1.8.7 for API compatibility. Audit cannot establish overall safety.
