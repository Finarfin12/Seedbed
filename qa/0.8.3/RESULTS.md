# Seedbed 0.8.3 verification (in progress)

- T-M1: Capture: 36 tests, build, check-bundle pass; CI green on 40421de.
- T-M2: subtree history has 3 earlier commits.
- T-M3: modifying the control rule in parity fixture made tests fail; restoring it gave 36/36.
- T-M4: git grep extension/ is empty outside historical CHANGELOG; README links to standalone repository. Link validation pending.
- T-L1: ESLint: zero errors; one warning prefer-setting-definitions deferred for Obsidian 1.8.7. Two sanitized transport error suppressions and one legacy CLI formatting suppression are narrowly scoped.
- T-L2: local deliberate any caused no-explicit-any lint failure; CI negative test pending.
- T-R1: 401/401 passed on Node 22 with no-file-parallelism before L3; rerun pending. Windows sandbox cleanup failures also reproduced on baseline.
- T-R2: 44 character cases passed against 0.8.2 regex behavior.
- T-R3: GUI pending.
- T-R4: debounce tests pass with fake timers; adapter tests pass in isolation; final suite pending.
- T-V1–T-V4: pending release and live scan.

## Dependency audit

Capture moved Vitest 3.2.7 to 5.1.0 with Vite 6.4.6; npm audit and npm audit --omit=dev returned zero. Plugin production audit: zero. Plugin dev audit: 12 moderate findings through two advisories. GHSA-g3hv-75wg-m249 (minimatch: glob amplification DoS) reaches typescript-eslint and eslint-plugin-obsidianmd via eslint-plugin-n. No patched 9.x or 10.x minimatch was listed at audit time; 11.0.8 is outside their dependency ranges. GHSA-4p3w-j4w9-5jqw (moment locale path traversal on crafted non-string input) comes through Obsidian type package. These are development dependencies, not direct evidence of runtime vulnerability; scanner/lint input and dev environment remain exposed. Obsidian types are pinned to 1.8.7 for API compatibility. Audit cannot establish overall safety.
