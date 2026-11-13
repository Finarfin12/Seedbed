import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["tests/setup-window.ts"],
		// Tes yang menjalankan proses nyata (kill, flood) bisa lambat saat beban tinggi.
		testTimeout: 30000,
		hookTimeout: 30000,
		exclude: ["node_modules/**", "tests/live/**"],
	},
});
