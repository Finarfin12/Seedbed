// Bundel 3 entry (service worker, popup tangkap, opsi) ke dist/ dan salin berkas statis. Siap "Load unpacked" dari dist/.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const OUT = "dist";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const copyStatic = () => {
	cpSync("manifest.json", `${OUT}/manifest.json`);
	cpSync("src/capture/capture.html", `${OUT}/capture.html`);
	cpSync("src/capture/capture.css", `${OUT}/capture.css`);
	cpSync("src/options/options.html", `${OUT}/options.html`);
	cpSync("src/options/options.css", `${OUT}/options.css`);
	cpSync("_locales", `${OUT}/_locales`, { recursive: true });
	if (existsSync("icons")) cpSync("icons", `${OUT}/icons`, { recursive: true });
};

const options = {
	entryPoints: {
		background: "src/background.ts",
		capture: "src/capture/capture.ts",
		options: "src/options/options.ts",
	},
	outdir: OUT,
	bundle: true,
	format: "iife",
	target: "chrome114",
	minify: !watch,
	sourcemap: false,
	legalComments: "none",
	logLevel: "info",
};

copyStatic();
if (watch) {
	const ctx = await esbuild.context(options);
	await ctx.watch();
} else {
	await esbuild.build(options);
}
