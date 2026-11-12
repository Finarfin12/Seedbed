// "claude" tiruan untuk tes: membaca stdin, perilaku ditentukan env FAKE_MODE.
import { readdirSync, writeFileSync } from "node:fs";

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
	const mode = process.env.FAKE_MODE ?? "ok";
	const wrap = (result, isError = false) => process.stdout.write(JSON.stringify({ type: "result", is_error: isError, result }));
	if (process.env.FAKE_PIDFILE) writeFileSync(process.env.FAKE_PIDFILE, String(process.pid));
	if (mode === "ok") return wrap('{"question":"Apa asumsimu?","category":"asumsi"}');
	if (mode === "echo") {
		return wrap(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), cwdEntries: readdirSync(process.cwd()), stdin }));
	}
	if (mode === "sleep") return void setInterval(() => {}, 1000);
	if (mode === "fail") {
		process.stderr.write("fatal: not logged in");
		process.exit(3);
	}
	if (mode === "badjson") return void process.stdout.write("hello, not json");
	if (mode === "iserror") return wrap("Invalid API key", true);
	if (mode === "explain") return wrap('{"question":"Cache itu menyimpan data supaya cepat.","category":"asumsi"}');
	if (mode === "flood") {
		const chunk = "x".repeat(65536);
		const t = setInterval(() => process.stdout.write(chunk), 1);
		return void t;
	}
	process.exit(9);
});
