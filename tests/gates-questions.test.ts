import { describe, expect, it } from "vitest";
import { devilGate } from "../src/domain/gates/devil";
import { feynmanGate } from "../src/domain/gates/feynman";
import { socraticGate } from "../src/domain/gates/socratic";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { DEVIL_CATEGORIES, SOCRATIC_CATEGORIES } from "../src/domain/questions/provider";
import { mergeBanks, StaticQuestionProvider } from "../src/domain/questions/staticProvider";
import type { Banks } from "../src/domain/questions/staticProvider";
import bankId from "../src/domain/questions/bank.id.json";
import bankEn from "../src/domain/questions/bank.en.json";
import { appendBlock, formatCallout } from "../src/domain/callout";
import { newNoteContent, safeFileName } from "../src/domain/templates";
import type { Gap } from "../src/domain/feynman/analyzer";

const S = DEFAULT_SETTINGS;
const banks: Banks = { id: bankId as Banks["id"], en: bankEn as Banks["en"] };

const long = "x".repeat(25);

describe("SocraticGate", () => {
	it("passes only when all 6 answers reach min chars", () => {
		const six = Array(6).fill(long);
		expect(socraticGate.evaluate({ settings: S, answers: six }).passed).toBe(true);
		expect(socraticGate.evaluate({ settings: S, answers: six.slice(0, 5) }).passed).toBe(false);
		const short = [...six];
		short[3] = "pendek";
		const r = socraticGate.evaluate({ settings: S, answers: short });
		expect(r).toMatchObject({ passed: false, done: 5, needed: 6 });
	});
	it("whitespace does not count; respects custom min", () => {
		const padded = Array(6).fill("   a   ");
		expect(socraticGate.evaluate({ settings: mergeSettings({ socraticMinChars: 1 }), answers: padded }).passed).toBe(true);
		expect(socraticGate.evaluate({ settings: S, answers: Array(6).fill(" ".repeat(30)) }).passed).toBe(false);
		expect(socraticGate.evaluate({ settings: mergeSettings({ socraticMinChars: 0 }), answers: Array(6).fill("") }).passed).toBe(false);
	});
});

describe("DevilsAdvocateGate", () => {
	it("passes with >= M of 5 answered (default 4)", () => {
		expect(devilGate.evaluate({ settings: S, answers: ["a", "b", "c", "d", ""] }).passed).toBe(true);
		expect(devilGate.evaluate({ settings: S, answers: ["a", "b", "c", "", ""] }).passed).toBe(false);
		expect(devilGate.evaluate({ settings: S, answers: ["a", "  ", "c", "d", "e"] })).toMatchObject({ done: 4, needed: 4 });
	});
	it("custom M", () => {
		const s = mergeSettings({ devilMinAnswered: 2 });
		expect(devilGate.evaluate({ settings: s, answers: ["a", "b", "", "", ""] }).passed).toBe(true);
	});
});

describe("FeynmanGate", () => {
	const gap = (over: Partial<Gap>): Gap => ({
		kind: "term", term: "t", key: "t", offset: 0, length: 1, line: 0, count: 1, words: 0, snippet: "", ignored: false, ...over,
	});
	it("passes when open term gaps <= maxGaps; ignored and sentence gaps do not count", () => {
		expect(feynmanGate.evaluate({ settings: S, gaps: [] }).passed).toBe(true);
		expect(feynmanGate.evaluate({ settings: S, gaps: [gap({})] }).passed).toBe(false);
		expect(feynmanGate.evaluate({ settings: S, gaps: [gap({ ignored: true })] }).passed).toBe(true);
		expect(feynmanGate.evaluate({ settings: S, gaps: [gap({ kind: "sentence" })] }).passed).toBe(true);
		const s = mergeSettings({ feynman: { maxGaps: 1 } });
		expect(feynmanGate.evaluate({ settings: s, gaps: [gap({})] }).passed).toBe(true);
		expect(feynmanGate.evaluate({ settings: s, gaps: [gap({}), gap({ key: "u" })] }).passed).toBe(false);
	});
});

describe("question banks", () => {
	for (const lang of ["id", "en"] as const) {
		it(`${lang}: >=3 questions in each of 6 Socratic categories`, () => {
			for (const c of SOCRATIC_CATEGORIES) {
				const list = banks[lang].socratic[c];
				expect(list.length, `${lang}.socratic.${c}`).toBeGreaterThanOrEqual(3);
				expect(list.every((q) => q.trim().length > 10)).toBe(true);
			}
		});
		it(`${lang}: >=3 questions in each of 5 Devil categories`, () => {
			for (const c of DEVIL_CATEGORIES) {
				expect(banks[lang].devil[c].length, `${lang}.devil.${c}`).toBeGreaterThanOrEqual(3);
			}
		});
		it(`${lang}: no extra/unknown categories`, () => {
			expect(Object.keys(banks[lang].socratic).sort()).toEqual([...SOCRATIC_CATEGORIES].sort());
			expect(Object.keys(banks[lang].devil).sort()).toEqual([...DEVIL_CATEGORIES].sort());
		});
	}
});

describe("StaticQuestionProvider", () => {
	it("returns one question per category, in order, 6 socratic / 5 devil", async () => {
		const p = new StaticQuestionProvider(banks);
		const s = await p.getQuestions("socratic", { language: "id" });
		expect(s.map((q) => q.category)).toEqual([...SOCRATIC_CATEGORIES]);
		const d = await p.getQuestions("devil", { language: "en" });
		expect(d.map((q) => q.category)).toEqual([...DEVIL_CATEGORIES]);
	});
	it("picks from the right language and is random but deterministic with injected rng", async () => {
		const first = new StaticQuestionProvider(banks, () => 0);
		const last = new StaticQuestionProvider(banks, () => 0.999999);
		const a = await first.getQuestions("socratic", { language: "en" });
		const b = await last.getQuestions("socratic", { language: "en" });
		expect(a[0]?.text).toBe(banks.en.socratic.klarifikasi[0]);
		expect(b[0]?.text).toBe(banks.en.socratic.klarifikasi.at(-1));
	});
	it("rng=1 does not go out of range", async () => {
		const p = new StaticQuestionProvider(banks, () => 1);
		const q = await p.getQuestions("devil", { language: "id" });
		expect(q.every((x) => typeof x.text === "string" && x.text.length > 0)).toBe(true);
	});
});

describe("mergeBanks (F-13)", () => {
	it("overrides valid categories only", () => {
		const m = mergeBanks(banks, {
			id: { socratic: { klarifikasi: ["Pertanyaanku?", "  ", 5] }, devil: { kegagalan: [] } },
			en: "nonsense",
			xx: {},
		});
		expect(m.id.socratic.klarifikasi).toEqual(["Pertanyaanku?"]);
		expect(m.id.devil.kegagalan).toEqual(banks.id.devil.kegagalan);
		expect(m.en).toEqual(banks.en);
		expect(banks.id.socratic.klarifikasi.length).toBeGreaterThan(1); // base not mutated
	});
	it("garbage input returns a copy of base", () => {
		expect(mergeBanks(banks, null)).toEqual(banks);
		expect(mergeBanks(banks, [1, 2])).toEqual(banks);
	});
});

describe("callout formatting", () => {
	it("formats entries with date and multi-line answers", () => {
		const out = formatCallout(
			"socratic",
			"Sesi Socratic",
			"2026-11-11",
			[
				{ label: "Klarifikasi", question: "Apa?", answer: "baris satu\n\nbaris tiga" },
				{ label: "Asumsi", question: "Apa lagi?", answer: "jawab" },
			],
			"Jawaban",
		);
		expect(out).toBe(
			[
				"> [!socratic]- Sesi Socratic — 2026-11-11",
				"> **Klarifikasi**",
				"> Apa?",
				"> Jawaban: baris satu",
				">",
				"> baris tiga",
				">",
				"> **Asumsi**",
				"> Apa lagi?",
				"> Jawaban: jawab",
			].join("\n"),
		);
	});
	it("adds source label (R-6) and meta flags on the label line", () => {
		const out = formatCallout(
			"socratic",
			"Sesi Socratic",
			"2026-11-12",
			[
				{ label: "Klarifikasi", question: "Cepat dibanding apa?", answer: "database", source: "AI · lokal (ollama)", meta: ["ditandai keliru", "petunjuk ×1"] },
				{ label: "Asumsi", question: "Apa?", answer: "x", source: "Bank" },
			],
			"Jawaban",
		);
		expect(out).toBe(
			[
				"> [!socratic]- Sesi Socratic — 2026-11-12",
				"> **Klarifikasi** · AI · lokal (ollama) · ditandai keliru · petunjuk ×1",
				"> Cepat dibanding apa?",
				"> Jawaban: database",
				">",
				"> **Asumsi** · Bank",
				"> Apa?",
				"> Jawaban: x",
			].join("\n"),
		);
	});
	it("appendBlock only appends: original text is an exact prefix (NF-6)", () => {
		for (const original of ["", "abc", "abc\n", "abc\n\n", "---\ntitle: x\n---\n\nIsi\n"]) {
			const out = appendBlock(original, "> [!devil]- X");
			expect(out.startsWith(original)).toBe(true);
			expect(out.endsWith("> [!devil]- X\n")).toBe(true);
		}
	});
});

describe("templates", () => {
	it("new idea note has plugin frontmatter with review date", () => {
		const c = newNoteContent("ide", "2026-11-11", S, "id");
		expect(c).toContain("type: idea\n");
		expect(c).toContain("status: seed\n");
		expect(c).toContain("created: 2026-11-11\n");
		expect(c).toContain("review: 2026-11-18\n");
		expect(c.startsWith("---\n")).toBe(true);
	});
	it("feynman note is a konsep with the 4-step hint callout (both languages)", () => {
		for (const lang of ["id", "en"] as const) {
			const c = newNoteContent("konsep", "2026-11-11", S, lang, true);
			expect(c).toContain("type: concept\n");
			expect(c).toContain("[!feynman-hint]");
			expect((c.match(/^> \d\./gm) ?? []).length).toBe(4);
		}
	});
	it("safeFileName strips illegal characters", () => {
		expect(safeFileName('a/b:c*d?"e<f>g|h#i^j[k]l')).toBe("a b c d e f g h i j k l");
		expect(safeFileName("  ..hidden  ")).toBe("hidden");
		expect(safeFileName("///")).toBe("");
	});
});
