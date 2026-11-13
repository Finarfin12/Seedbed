import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(import.meta.dirname, "tests/helpers/obsidian-mock.ts"),
		},
	},
	test: {
		setupFiles: ["tests/setup-window.ts"],
		// Tes yang menjalankan proses nyata (kill, flood) bisa lambat saat beban tinggi.
		testTimeout: 30000,
		hookTimeout: 30000,
		exclude: ["node_modules/**", "tests/live/**"],
	},
});
