import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
export default defineConfig([
  globalIgnores(["node_modules", "**/node_modules", "dist", "**/dist", "build", "test-vault", "qa", "docs", "scripts", "tests", "**/tests", "main.js", "esbuild.config.mjs", "version-bump.mjs", "**/*.config.*", "extension/build*", "**/*.test.ts"]),
  ...obsidianmd.configs.recommended,
  { rules: { "preserve-caught-error": "error", "obsidianmd/settings-tab/prefer-setting-definitions": "warn" } },
  { languageOptions: { parserOptions: { projectService: { allowDefaultProject: ["eslint.config.*"] }, tsconfigRootDir: import.meta.dirname } } },
]);
