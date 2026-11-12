import { defineConfig } from "vitest/config";

// Uji sungguhan (memakai kuota langganan CLI). Jalankan: npm run test:live
export default defineConfig({
	test: {
		include: ["tests/live/**/*.live.test.ts"],
		testTimeout: 180000,
		fileParallelism: false,
	},
});
