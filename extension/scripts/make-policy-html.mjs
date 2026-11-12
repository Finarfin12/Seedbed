// Mengubah store/privacy-policy*.md menjadi HTML statis (tanpa skrip, CSS inline) untuk di-host sendiri. Jalankan: node scripts/make-policy-html.mjs
import { readFileSync, writeFileSync } from "node:fs";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
function convert(md, lang) {
	const out = [];
	let list = null;
	const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
	let title = "";
	for (const raw of md.split("\n")) {
		const line = raw.trimEnd();
		if (!line.trim()) { close(); continue; }
		let m;
		if ((m = /^# (.*)/.exec(line))) { close(); title = m[1]; out.push(`<h1>${inline(m[1])}</h1>`); }
		else if ((m = /^## (.*)/.exec(line))) { close(); out.push(`<h2>${inline(m[1])}</h2>`); }
		else if ((m = /^- (.*)/.exec(line))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
		else if ((m = /^\d+\. (.*)/.exec(line))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
		else { close(); out.push(`<p>${inline(line)}</p>`); }
	}
	close();
	return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1b1f23;background:#fff}
h1{font-size:1.7rem}h2{font-size:1.2rem;margin-top:2rem}code{background:#f0f2f4;padding:.1em .35em;border-radius:4px;font-size:.92em}
a{color:#1a6b2a}@media (prefers-color-scheme:dark){body{color:#e6e8ea;background:#16181a}code{background:#2a2e31}a{color:#7fd08a}}
</style>
</head>
<body>
${out.join("\n")}
</body>
</html>
`;
}
writeFileSync("store/privacy-policy.html", convert(readFileSync("store/privacy-policy.md", "utf8"), "en"));
writeFileSync("store/privacy-policy.id.html", convert(readFileSync("store/privacy-policy.id.md", "utf8"), "id"));
console.log("privacy-policy.html dan privacy-policy.id.html dibuat");
