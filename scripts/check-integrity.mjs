// Membandingkan test-vault/ terhadap snapshot baseline (.manual-baseline/): NF-6.
// Aturan: badan catatan hanya boleh bertambah (awalan identik); baris frontmatter non-"bengkel-"/"seedbed-" identik.
// Snapshot dibuat manual sebelum uji (salin Ide/, Konsep/, Referensi/, "Catatan harian.md" ke .manual-baseline/).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = join(base, ".manual-baseline");
const B = join(base, "test-vault");

const walk = (d) =>
	readdirSync(d).flatMap((n) => {
		const p = join(d, n);
		return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
	});

const split = (t) => {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
	return m ? { fm: m[1].split(/\r?\n/), body: t.slice(m[0].length) } : { fm: [], body: t };
};

// Baris frontmatter milik plugin: kunci bengkel-*/seedbed-* dan item list gerbang.
const isOurs = (line) => /^(bengkel-[a-z]+|seedbed-[a-z]+|type|status|created|review|gates|source|origin):/.test(line) || /^\s+- (socratic|devil|feynman)$/.test(line);

let violations = 0;
let bodyUnchanged = 0;
let bodyAppendedOnly = 0;
let frontmatterTouched = 0;
const files = walk(A);
for (const f of files) {
	const rel = relative(A, f).split("\\").join("/");
	const cur = join(B, rel);
	if (!existsSync(cur)) {
		console.log("MISSING", rel);
		violations++;
		continue;
	}
	const a = split(readFileSync(f, "utf8"));
	const b = split(readFileSync(cur, "utf8"));
	const fa = a.fm.filter((l) => !isOurs(l)).join("\n");
	const fb = b.fm.filter((l) => !isOurs(l)).join("\n");
	if (fa !== fb) {
		console.log("FOREIGN-FRONTMATTER-CHANGED", rel, JSON.stringify(fa), "->", JSON.stringify(fb));
		violations++;
	}
	if (!b.body.startsWith(a.body.replace(/\s+$/, ""))) {
		console.log("BODY-NOT-PREFIX", rel);
		violations++;
	} else if (b.body.trimEnd() === a.body.trimEnd()) bodyUnchanged++;
	else bodyAppendedOnly++;
	if (a.fm.join("\n") !== b.fm.join("\n")) frontmatterTouched++;
}
console.log({ checked: files.length, bodyUnchanged, bodyAppendedOnly, frontmatterTouched, violations });
process.exit(violations ? 1 : 0);
