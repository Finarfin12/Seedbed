import { describe, expect, it } from "vitest";
import { analyze, maskText } from "../src/domain/feynman/analyzer";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import type { Gap } from "../src/domain/feynman/analyzer";

const S = DEFAULT_SETTINGS;
const terms = (text: string, t: string[], s = S, ignored: string[] = []): Gap[] =>
	analyze(text, t, s, ignored).filter((g) => g.kind === "term");

describe("maskText", () => {
	it("keeps length and newlines identical", () => {
		const text = "---\na: b\n---\nHalo `kode` dunia\n```js\nx = 1\n```\n<!-- c -->\n[x](http://a.b)\nakhir";
		const m = maskText(text);
		expect(m.length).toBe(text.length);
		expect([...m].map((c) => c === "\n")).toEqual([...text].map((c) => c === "\n"));
		expect(m).not.toContain("kode");
		expect(m).not.toContain("x = 1");
		expect(m).not.toContain("a: b");
		expect(m).toContain("Halo");
		expect(m).toContain("akhir");
	});
	it("masks only plugin callouts, not other quotes", () => {
		const text = "> [!socratic]- Sesi\n> **Q:** entropi\n> Jawaban: x\n\n> kutipan entropi\n\n> [!note]\n> entropi lagi";
		const m = maskText(text);
		expect(m).not.toContain("Sesi");
		expect(m.match(/entropi/g)?.length).toBe(2);
	});
	it("unclosed fence masks to end", () => {
		expect(maskText("a\n```\nsecret\nmore")).not.toContain("secret");
	});
});

describe("whole-word matching", () => {
	it("matches whole words only, case-insensitively", () => {
		expect(terms("Aku suka Entropi.", ["entropi"])).toHaveLength(1);
		expect(terms("Aku suka entropis.", ["entropi"])).toHaveLength(0);
		expect(terms("Aku suka superentropi.", ["entropi"])).toHaveLength(0);
		expect(terms("entropi_baru dan x", ["entropi"])).toHaveLength(0);
	});
	it("handles multi-word terms, extra whitespace, and regex metacharacters", () => {
		expect(terms("Aku belajar machine   learning hari ini.", ["Machine Learning"])).toHaveLength(1);
		expect(terms("Pakai C++ dan C#.", ["C++"])).toHaveLength(1);
		expect(terms("Harga (USD) naik.", ["(USD)"])).toHaveLength(1);
	});
	it("works with non-ASCII letters", () => {
		expect(terms("Konsep éntropie itu sulit.", ["éntropie"])).toHaveLength(1);
		expect(terms("Konsep éntropiex itu sulit.", ["éntropie"])).toHaveLength(0);
	});
	it("counts occurrences and reports first offset/line", () => {
		const text = "baris nol\nentropi satu entropi dua\nEntropi";
		const [g] = terms(text, ["entropi"]);
		expect(g?.count).toBe(3);
		expect(g?.line).toBe(1);
		expect(text.slice(g!.offset, g!.offset + g!.length)).toBe("entropi");
		expect(g?.snippet).toContain("entropi satu");
	});
	it("de-duplicates terms and ignores blanks", () => {
		expect(terms("entropi", ["Entropi", "entropi", " ", ""])).toHaveLength(1);
	});
});

describe("ignore code, frontmatter, links", () => {
	it("ignores terms inside fenced and inline code", () => {
		expect(terms("```\nentropi\n```", ["entropi"])).toHaveLength(0);
		expect(terms("Pakai `entropi` saja.", ["entropi"])).toHaveLength(0);
		expect(terms("~~~\nentropi\n~~~", ["entropi"])).toHaveLength(0);
	});
	it("ignores frontmatter (aliases) and html comments and link targets", () => {
		expect(terms("---\naliases: [entropi]\n---\nIsi biasa.", ["entropi"])).toHaveLength(0);
		expect(terms("<!-- entropi -->", ["entropi"])).toHaveLength(0);
		expect(terms("[lihat](https://x.y/entropi)", ["entropi"])).toHaveLength(0);
	});
	it("a definition inside a code block does not count as a definition", () => {
		const text = "```\nentropi adalah x\n```\nAku pakai entropi.";
		expect(terms(text, ["entropi"])).toHaveLength(1);
	});
	it("text in plugin callouts (answers, hints) is not analysed", () => {
		expect(terms("> [!feynman-hint]- Petunjuk\n> jelaskan entropi\n\nPenjelasan kosong.", ["entropi"])).toHaveLength(0);
	});
});

describe("definition patterns (ID & EN)", () => {
	const verbs = ["adalah", "yaitu", "ialah", "artinya", "berarti", "merupakan", "is", "means", "refers to"];
	for (const v of verbs) {
		it(`"X ${v}" counts as defined`, () => {
			expect(terms(`Entropi ${v} ukuran keacakan. Entropi naik.`, ["entropi"])).toHaveLength(0);
		});
	}
	it("is case-insensitive and allows comma, bold, wikilink, quotes", () => {
		expect(terms("ENTROPI ADALAH x", ["entropi"])).toHaveLength(0);
		expect(terms("Entropi, yaitu ukuran.", ["entropi"])).toHaveLength(0);
		expect(terms("**Entropi** adalah ukuran.", ["entropi"])).toHaveLength(0);
		expect(terms("[[Entropi]] merupakan ukuran.", ["entropi"])).toHaveLength(0);
		expect(terms("\"Entropi\" artinya keacakan.", ["entropi"])).toHaveLength(0);
	});
	it("works when the verb is on the next line", () => {
		expect(terms("Entropi\nadalah ukuran.", ["entropi"])).toHaveLength(0);
	});
	it("definition of one term does not define another", () => {
		const g = terms("Entropi adalah ukuran. Aku juga pakai algoritma.", ["entropi", "algoritma"]);
		expect(g.map((x) => x.key)).toEqual(["algoritma"]);
	});
	it("a verb that is only part of another word does not count", () => {
		expect(terms("Entropi islami.", ["entropi"])).toHaveLength(1);
		expect(terms("Entropi merupakannya", ["entropi"])).toHaveLength(1);
	});
	it("verb before the term does not count", () => {
		expect(terms("adalah entropi", ["entropi"])).toHaveLength(1);
	});
	it("term that never appears is not a gap", () => {
		expect(terms("Teks lain saja.", ["entropi"])).toHaveLength(0);
	});
});

describe("jargon and ignore", () => {
	it("uses user jargon in addition to vault terms", () => {
		const s = mergeSettings({ feynman: { jargon: ["idempoten"] } });
		const g = terms("Operasi ini idempoten.", [], s);
		expect(g.map((x) => x.key)).toEqual(["idempoten"]);
	});
	it("marks ignored terms (per-note), case-insensitive", () => {
		const g = terms("Entropi dan Algoritma.", ["Entropi", "Algoritma"], S, ["entropi"]);
		expect(g.find((x) => x.key === "entropi")?.ignored).toBe(true);
		expect(g.find((x) => x.key === "algoritma")?.ignored).toBe(false);
	});
});

describe("long sentences", () => {
	const words = (n: number) => Array.from({ length: n }, (_, i) => `kata${i}`).join(" ");
	it("flags sentences above the threshold, not at the threshold", () => {
		const s = analyze(`${words(25)}. ${words(26)}.`, [], S).filter((g) => g.kind === "sentence");
		expect(s).toHaveLength(1);
		expect(s[0]?.words).toBe(26);
	});
	it("respects custom threshold and reports offsets that point at the sentence", () => {
		const s2 = mergeSettings({ feynman: { maxSentenceWords: 5 } });
		const text = `Pendek saja.\n${words(8)}.`;
		const [g] = analyze(text, [], s2).filter((x) => x.kind === "sentence");
		expect(g?.line).toBe(1);
		expect(text.slice(g!.offset, g!.offset + 5)).toBe("kata0");
	});
	it("does not split on decimals or abbreviations without trailing space", () => {
		const s2 = mergeSettings({ feynman: { maxSentenceWords: 5 } });
		const g = analyze("Nilai pi adalah 3.14159 kira-kira dan seterusnya.", [], s2).filter((x) => x.kind === "sentence");
		expect(g).toHaveLength(1);
	});
	it("ignores code blocks when counting", () => {
		expect(analyze(`\`\`\`\n${words(40)}.\n\`\`\``, [], S)).toHaveLength(0);
	});
	it("a sentence gap is never marked ignored and results are sorted by offset", () => {
		const text = `Entropi dulu. ${words(30)}. Algoritma.`;
		const gaps = analyze(text, ["entropi", "algoritma"], S);
		expect(gaps.map((g) => g.offset)).toEqual([...gaps.map((g) => g.offset)].sort((a, b) => a - b));
		expect(gaps.filter((g) => g.kind === "sentence").every((g) => !g.ignored)).toBe(true);
	});
});

describe("false-positive sample explanations (Fase 4 uji khusus)", () => {
	const vault = ["entropi", "algoritma", "basis data", "kompleksitas", "rekursi"];
	const cases: Array<{ name: string; text: string; expectOpen: string[] }> = [
		{
			name: "baik: semua istilah didefinisikan",
			text: "Entropi adalah ukuran keacakan. Algoritma yaitu langkah-langkah terurut. Basis data merupakan tempat simpan data.",
			expectOpen: [],
		},
		{
			name: "baik: tidak memakai istilah vault",
			text: "Bayangkan kamar yang makin berantakan kalau tidak dirapikan. Itu mirip dengan aturan alam.",
			expectOpen: [],
		},
		{
			name: "buruk: memakai istilah tanpa definisi",
			text: "Entropi selalu naik, dan algoritma yang baik punya kompleksitas rendah.",
			expectOpen: ["algoritma", "entropi", "kompleksitas"],
		},
		{
			name: "campur: sebagian didefinisikan",
			text: "Rekursi adalah fungsi memanggil dirinya. Rekursi cocok untuk algoritma pohon.",
			expectOpen: ["algoritma"],
		},
		{
			name: "buruk: hanya menyebut dalam kode tidak dihitung",
			text: "Lihat `algoritma` di bawah.\n```\nentropi()\n```\nSelesai.",
			expectOpen: [],
		},
	];
	for (const c of cases) {
		it(c.name, () => {
			const open = terms(c.text, vault)
				.filter((g) => !g.ignored)
				.map((g) => g.key)
				.sort();
			expect(open).toEqual(c.expectOpen);
		});
	}
});
