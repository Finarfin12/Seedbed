import { describe, expect, it } from "vitest";
import { toISODate } from "../src/domain/dates";
import { parseIdeaNote } from "../src/domain/frontmatter";
import { uniqueBase } from "../src/domain/captureValidator";
import { buildDigest, gatesFromText, isStuck, suggest } from "../src/domain/v08";
import type { Idea } from "../src/domain/types";

const mk = (over: Partial<Idea>): Idea => ({ path: "x.md", title: "X", tipe: "ide", status: "tumbuh", dibuat: "2026-09-01", tinjau: "2026-12-01", gerbang: ["socratic"], tersentuh: "2026-11-13", ...over });
const TODAY = "2026-11-13";

describe("8c stuck = file modified time (Q1)", () => {
	it("31 days is stuck, 30 and 29 are not (> threshold, default 30)", () => {
		expect(isStuck(mk({ tersentuh: "2026-10-13" }), TODAY, 30)).toBe(true); // 31
		expect(isStuck(mk({ tersentuh: "2026-10-14" }), TODAY, 30)).toBe(false); // 30
		expect(isStuck(mk({ tersentuh: "2026-10-15" }), TODAY, 30)).toBe(false); // 29
	});
	it("discarded or unknown mtime is never stuck; threshold is configurable", () => {
		expect(isStuck(mk({ status: "dibuang", tersentuh: "2020-01-01" }), TODAY, 30)).toBe(false);
		expect(isStuck(mk({ tersentuh: undefined }), TODAY, 30)).toBe(false);
		expect(isStuck(mk({ tersentuh: "2026-11-01" }), TODAY, 7)).toBe(true);
	});
	it("mtime becomes a LOCAL calendar date around midnight", () => {
		const late = new Date(2026, 9, 13, 23, 59, 30).getTime();
		const early = new Date(2026, 9, 14, 0, 0, 30).getTime();
		expect(toISODate(new Date(late))).toBe("2026-10-13");
		expect(toISODate(new Date(early))).toBe("2026-10-14");
	});
});

describe("8c digest", () => {
	const ideas = [
		mk({ path: "a.md", title: "Old idea", status: "benih", gerbang: [], tersentuh: "2026-09-28", tinjau: "2026-10-30", dibuat: "2026-09-01" }),
		mk({ path: "b.md", title: "Fresh idea", tersentuh: "2026-11-12", tinjau: "2026-12-20", dibuat: "2026-11-10" }),
		mk({ path: "c.md", title: "Dropped", status: "dibuang", tinjau: undefined, tersentuh: "2026-01-01" }),
	];
	it("has the five sections and no frontmatter (so it is not a Seedbed note)", () => {
		const md = buildDigest({ ideas, today: TODAY, stuckDays: 30, gatesThisWeek: [{ title: "Fresh idea", gate: "socratic" }], lang: "en" });
		expect(md.startsWith("# Seedbed digest 2026-11-13")).toBe(true);
		for (const h of ["## Due now", "## Stuck", "## Per status", "## This week", "## Suggested to test"]) expect(md).toContain(h);
		expect(md.startsWith("---")).toBe(false);
		expect(md).not.toMatch(/^type:/m);
		expect(parseIdeaNote("Digests/d.md", "d", undefined).kind).toBe("none");
	});
	it("suggests the longest-stuck idea with a fact-based reason; no ranking words", () => {
		const s = suggest(ideas, TODAY, 30);
		expect(s?.idea.title).toBe("Old idea");
		expect(s?.reasonKey).toBe("stuck-no-socratic");
		const md = buildDigest({ ideas, today: TODAY, stuckDays: 30, gatesThisWeek: [], lang: "en" });
		expect(md).toContain("[[Old idea]]: not edited for 46 days and the Socratic gate is not passed yet.");
		expect(md).not.toMatch(/\b(best|top|ranking|rank|better|worse|promising)\b/i);
		const id = buildDigest({ ideas, today: TODAY, stuckDays: 30, gatesThisWeek: [], lang: "id" });
		expect(id).toContain("tidak diedit 46 hari");
		expect(id).not.toMatch(/\b(terbaik|peringkat|ranking)\b/i);
	});
	it("falls back to the longest-due idea, then to nothing", () => {
		expect(suggest([mk({ tersentuh: "2026-11-12", tinjau: "2026-11-01" })], TODAY, 30)?.reasonKey).toBe("due");
		expect(suggest([mk({ tersentuh: "2026-11-12", tinjau: "2026-12-30" })], TODAY, 30)).toBeNull();
	});
	it("this week's gates come from callout dates within 7 days only", () => {
		const t = "> [!socratic]- Socratic session — 2026-11-10\n> x\n\n> [!devil]- Devil's Advocate — 2026-10-01\n> x\n\n> [!premortem]- Pre-mortem — 2026-11-13\n";
		expect(gatesFromText(t, TODAY).sort()).toEqual(["premortem", "socratic"]);
	});
	it("digest file names never overwrite: second digest gets a number", () => {
		expect(uniqueBase("Seedbed digest 2026-11-13", ["Seedbed digest 2026-11-13.md"])).toBe("Seedbed digest 2026-11-13 2");
		expect(uniqueBase("Seedbed digest 2026-11-13", ["Seedbed digest 2026-11-13.md", "Seedbed digest 2026-11-13 2.md"])).toBe("Seedbed digest 2026-11-13 3");
	});
});
