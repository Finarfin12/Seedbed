import { describe, expect, it } from "vitest";
import { formatCallout } from "../src/domain/callout";
import { analyze } from "../src/domain/feynman/analyzer";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { connectQuestion, rankCandidates, relatedLine } from "../src/domain/v08";

const gapOf = (text: string, term: string) => analyze(text, [term], DEFAULT_SETTINGS, []).find((g) => g.kind === "term");

describe("8d connect: candidates come only from the notes the caller passes (Seedbed index)", () => {
	const target = { path: "t.md", title: "Komunitas kopi", text: "Ide komunitas kopi dan kafe lokal untuk pembaca buku." };
	const pool = [
		{ path: "a.md", title: "Kafe baca", text: "Kafe lokal tempat komunitas membaca kopi pagi." },
		{ path: "b.md", title: "Resep roti", text: "Tepung, ragi, dan oven." },
		{ path: "t.md", title: "Komunitas kopi", text: "same note" },
	];
	it("ranks by shared words, excludes the note itself and zero-score notes, caps the number", () => {
		const r = rankCandidates(target, pool, 10);
		expect(r.map((x) => x.note.path)).toEqual(["a.md"]);
		expect(rankCandidates(target, Array.from({ length: 30 }, (_, i) => ({ path: `n${i}.md`, title: `Kopi ${i}`, text: "kopi komunitas" })), 10)).toHaveLength(10);
	});
	it("frontmatter and callout markers are not similarity: same properties but different topics do not match", () => {
		const fmx = ["---", "type: idea", "status: seed", "created: 2026-11-13", "review: 2026-12-30", "gates: []", "---", ""].join("\n");
		const callout = ["> [!socratic]- Socratic session — 2026-11-01", "> **Assumptions** · Bank", "> Answer: x"].join("\n");
		const a = { path: "a.md", title: "Quasar", text: fmx + "\nZebra xylophone nebula." };
		const b = { path: "b.md", title: "Roti", text: fmx + "\nTepung ragi oven.\n\n" + callout };
		expect(rankCandidates(a, [b], 10)).toEqual([]);
		expect(rankCandidates({ ...a, text: fmx + "\nTepung dan ragi." }, [b], 10)).toHaveLength(1);
		expect(rankCandidates({ ...a, text: "\nSocratic assumptions bank" }, [b], 10)).toEqual([]);
	});
	it("a note that is not in the pool can never be returned (even with a near-identical title)", () => {
		const r = rankCandidates(target, pool, 10);
		expect(JSON.stringify(r)).not.toContain("JANGAN-DIBACA");
		expect(r.every((x) => pool.some((p) => p.path === x.note.path))).toBe(true);
	});
	it("question text is fixed and language-aware", () => {
		expect(connectQuestion("en", "Kafe baca")).toBe('Does this idea support, contradict, or relate to "Kafe baca"? Explain in your own words.');
		expect(connectQuestion("id", "Kafe baca")).toContain("mendukung, bertentangan dengan, atau berkaitan dengan");
	});
	it("relatedLine strips link-breaking characters so a title cannot inject links or headings", () => {
		expect(relatedLine("Kafe baca")).toBe("Related: [[Kafe baca]]");
		expect(relatedLine("A]] [[evil|x#y^z\\w")).toBe("Related: [[A evil x y z w]]");
		expect(relatedLine("two\nlines")).toBe("Related: [[two lines]]");
	});
	it("connect callout follows the v2 layout: label = candidate title, question, Answer", () => {
		const out = formatCallout("connect", "Connect", "2026-11-13", [{ label: "Kafe baca", question: connectQuestion("en", "Kafe baca"), answer: "It relates.", source: "Bank" }], "Answer");
		expect(out).toBe('> [!connect]- Connect — 2026-11-13\n> **Kafe baca** · Bank\n> Does this idea support, contradict, or relate to "Kafe baca"? Explain in your own words.\n> Answer: It relates.');
	});
});

describe("8d Feynman: weak definitions", () => {
	it("flags circular and empty definitions (EN and ID)", () => {
		expect(gapOf("Entropy is entropy.", "entropy")?.weak).toBe("circular");
		expect(gapOf("Entropy is a kind of entropy that grows.", "entropy")?.weak).toBe("circular");
		expect(gapOf("Latency is an important thing.", "latency")?.weak).toBe("empty");
		expect(gapOf("Entropi adalah hal yang sangat penting.", "entropi")?.weak).toBe("empty");
		expect(gapOf("Entropi adalah entropi.", "entropi")?.weak).toBe("circular");
	});
	it("does NOT flag real definitions", () => {
		expect(gapOf("A database is a system that stores structured records so they can be queried.", "database")).toBeUndefined();
		expect(gapOf("Entropi adalah ukuran ketidakteraturan sebuah sistem.", "entropi")).toBeUndefined();
		expect(gapOf("Latency means the delay between a request and its response.", "latency")).toBeUndefined();
	});
	it("a multi-word term is circular only when ALL its words come back", () => {
		expect(gapOf("Machine learning is a method where learning happens from data.", "machine learning")).toBeUndefined();
		expect(gapOf("Machine learning is machine learning of sorts.", "machine learning")?.weak).toBe("circular");
	});
	it("a weak gap stays a term gap that can be ignored like any other", () => {
		const gaps = analyze("Entropy is entropy.", ["entropy"], DEFAULT_SETTINGS, ["entropy"]);
		expect(gaps.find((g) => g.kind === "term")?.ignored).toBe(true);
	});
	it("callouts written by the plugin, skill, and extension do not count as explanation or create gaps", () => {
		for (const type of ["premortem", "retrieval", "connect", "socratic", "devil", "feynman-hint", "trigger", "quote"]) {
			expect(analyze(`> [!${type}]- T\n> Latency is the delay between request and response.\n> We use latency here.`, ["latency"], DEFAULT_SETTINGS, []).filter((g) => g.kind === "term")).toEqual([]);
		}
	});
});

describe("8d settings: connect and reminder fields", () => {
	it("keeps a valid lastReminded date and rejects garbage", () => {
		expect(mergeSettings({ digest: { lastReminded: "2026-11-10" } }).digest.lastReminded).toBe("2026-11-10");
		expect(mergeSettings({ digest: { lastReminded: "10/11/2026" } }).digest.lastReminded).toBe("");
		expect(mergeSettings({ connect: { enabled: false } }).connect.enabled).toBe(false);
	});
});
