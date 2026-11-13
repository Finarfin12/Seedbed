import { describe, expect, it } from "vitest";
import { addDays, isValidISODate, toISODate } from "../src/domain/dates";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { isDue, nextReview, snooze } from "../src/domain/scheduler";
import { applyPatch, KEY, parseIdeaNote } from "../src/domain/frontmatter";
import { applyPatchFor } from "../src/domain/transition";
import { canTransition, nextStatus } from "../src/domain/stateMachine";
import { GateRegistry } from "../src/domain/gates/registry";
import type { Idea, Settings } from "../src/domain/types";

const S: Settings = structuredClone(DEFAULT_SETTINGS);
const idea = (over: Partial<Idea> = {}): Idea => ({
	path: "Ide/a.md",
	title: "a",
	tipe: "ide",
	status: "benih",
	gerbang: [],
	...over,
});

describe("dates", () => {
	it("validates ISO dates", () => {
		expect(isValidISODate("2026-11-11")).toBe(true);
		expect(isValidISODate("2026-02-30")).toBe(false);
		expect(isValidISODate("11-11-2026")).toBe(false);
		expect(isValidISODate(123)).toBe(false);
	});
	it("adds days across month/year/leap boundaries", () => {
		expect(addDays("2026-11-25", 7)).toBe("2026-12-02");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});
	it("formats local date", () => {
		expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
	});
});

describe("scheduler", () => {
	it("uses interval per status", () => {
		expect(nextReview("benih", "2026-11-11", S)).toBe("2026-11-18");
		expect(nextReview("tumbuh", "2026-11-11", S)).toBe("2026-11-25");
		expect(nextReview("matang", "2026-11-11", S)).toBe("2026-12-11");
	});
	it("respects custom intervals", () => {
		const s = mergeSettings({ intervals: { benih: 3 } });
		expect(nextReview("benih", "2026-11-11", s)).toBe("2026-11-14");
	});
	it("dibuang has no review date", () => {
		expect(nextReview("dibuang", "2026-11-11", S)).toBeNull();
	});
	it("snooze adds n days to today", () => {
		expect(snooze("2026-11-11", 3)).toBe("2026-11-14");
	});
	it("isDue: due today, past, missing date; not future; never dibuang", () => {
		expect(isDue(idea({ tinjau: "2026-11-11" }), "2026-11-11")).toBe(true);
		expect(isDue(idea({ tinjau: "2026-11-01" }), "2026-11-11")).toBe(true);
		expect(isDue(idea({ tinjau: "2026-11-12" }), "2026-11-11")).toBe(false);
		expect(isDue(idea({ tinjau: undefined }), "2026-11-11")).toBe(true);
		expect(isDue(idea({ status: "dibuang", tinjau: "2020-01-01" }), "2026-11-11")).toBe(false);
	});
});

describe("settings merge", () => {
	it("returns defaults for garbage", () => {
		expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(mergeSettings("x")).toEqual(DEFAULT_SETTINGS);
	});
	it("keeps valid values, replaces invalid ones, clamps numbers", () => {
		const s = mergeSettings({
			language: "en",
			folderIde: 42,
			intervals: { benih: -5, tumbuh: "x", matang: 60 },
			devilMinAnswered: 99,
			gates: { socratic: false, devil: "yes" },
			feynman: { jargon: ["a", 1], ignored: { "x.md": ["foo", 2] } },
		});
		expect(s.language).toBe("en");
		expect(s.folderIde).toBe("Ide");
		expect(s.intervals).toEqual({ benih: 1, tumbuh: 14, matang: 60 });
		expect(s.devilMinAnswered).toBe(5);
		expect(s.gates).toEqual({ socratic: false, devil: true, feynman: true });
		expect(s.feynman.jargon).toEqual(["a"]);
		expect(s.feynman.ignored).toEqual({ "x.md": ["foo"] });
	});
	it("does not mutate defaults", () => {
		const s = mergeSettings({});
		s.feynman.jargon.push("x");
		expect(DEFAULT_SETTINGS.feynman.jargon).toEqual([]);
	});
});

describe("frontmatter parse", () => {
	it("ignores notes without Seedbed properties", () => {
		expect(parseIdeaNote("a.md", "a", { title: "x" }).kind).toBe("none");
		expect(parseIdeaNote("a.md", "a", undefined).kind).toBe("none");
	});
	it("parses a valid idea", () => {
		const r = parseIdeaNote("a.md", "a", {
			[KEY.type]: "idea",
			[KEY.status]: "growing",
			[KEY.created]: "2026-11-01",
			[KEY.review]: "2026-11-15",
			[KEY.gates]: ["socratic", "bogus", "socratic"],
		});
		expect(r).toEqual({
			kind: "idea",
			idea: {
				path: "a.md",
				title: "a",
				tipe: "ide",
				status: "tumbuh",
				dibuat: "2026-11-01",
				tinjau: "2026-11-15",
				gerbang: ["socratic"],
				gerbangLain: ["bogus"],
			},
		});
	});
	it("accepts Date objects and single-string gates, case-insensitive status", () => {
		const r = parseIdeaNote("a.md", "a", {
			[KEY.type]: "Concept",
			[KEY.status]: " SEED ",
			[KEY.review]: new Date("2026-11-20T00:00:00Z"),
			[KEY.gates]: "feynman",
		});
		expect(r.kind).toBe("idea");
		if (r.kind === "idea") {
			expect(r.idea.tinjau).toBe("2026-11-20");
			expect(r.idea.gerbang).toEqual(["feynman"]);
			expect(r.idea.status).toBe("benih");
		}
	});
	it("marks invalid status/tipe as invalid, never throws", () => {
		expect(parseIdeaNote("a.md", "a", { [KEY.type]: "idea", [KEY.status]: "abc" }).kind).toBe("invalid");
		expect(parseIdeaNote("a.md", "a", { [KEY.type]: "idea" }).kind).toBe("invalid"); // type idea tanpa status
		// Bukan milik Seedbed: type bukan idea/concept => diabaikan total (bukan "invalid")
		expect(parseIdeaNote("a.md", "a", { [KEY.status]: "seed" }).kind).toBe("none");
		expect(parseIdeaNote("a.md", "a", { [KEY.type]: 5, [KEY.status]: {} }).kind).toBe("none");
	});
	it("treats a bad tinjau as missing (so it becomes due)", () => {
		const r = parseIdeaNote("a.md", "a", { [KEY.type]: "idea", [KEY.status]: "seed", [KEY.review]: "besok" });
		expect(r.kind === "idea" && r.idea.tinjau).toBeUndefined();
	});
});

describe("frontmatter patch (NF-6)", () => {
	it("only touches Seedbed property names", () => {
		const fm: Record<string, unknown> = { title: "Keep", tags: ["x"], aliases: ["y"], [KEY.status]: "seed" };
		applyPatch(fm, { status: "tumbuh", tinjau: "2026-12-01", gerbang: ["socratic"] });
		expect(fm.title).toBe("Keep");
		expect(fm.tags).toEqual(["x"]);
		expect(fm.aliases).toEqual(["y"]);
		expect(fm[KEY.status]).toBe("growing");
		expect(fm[KEY.review]).toBe("2026-12-01");
		const changed = Object.keys(fm).filter((k) => !["title", "tags", "aliases"].includes(k));
		expect(changed.every((k) => (Object.values(KEY) as string[]).includes(k))).toBe(true);
	});
	it("null removes tinjau; undefined leaves it", () => {
		const fm: Record<string, unknown> = { [KEY.review]: "2026-12-01" };
		applyPatch(fm, { status: "dibuang" });
		expect(fm[KEY.review]).toBe("2026-12-01");
		applyPatch(fm, { tinjau: null });
		expect(KEY.review in fm).toBe(false);
	});
});

describe("state machine", () => {
	it("nextStatus", () => {
		expect(nextStatus("benih")).toBe("tumbuh");
		expect(nextStatus("tumbuh")).toBe("matang");
		expect(nextStatus("matang")).toBeNull();
		expect(nextStatus("dibuang")).toBeNull();
	});
	it("ide benih->tumbuh needs socratic, konsep needs feynman", () => {
		expect(canTransition(idea(), "tumbuh", S)).toEqual({ ok: false, requiredGate: "socratic" });
		expect(canTransition(idea({ tipe: "konsep" }), "tumbuh", S)).toEqual({ ok: false, requiredGate: "feynman" });
	});
	it("passed gate is not required again", () => {
		expect(canTransition(idea({ gerbang: ["socratic"] }), "tumbuh", S).ok).toBe(true);
		expect(canTransition(idea({ tipe: "konsep", gerbang: ["feynman"] }), "tumbuh", S).ok).toBe(true);
	});
	it("disabled gate => direct transition", () => {
		const off = mergeSettings({ gates: { socratic: false, feynman: false, devil: false } });
		expect(canTransition(idea(), "tumbuh", off).ok).toBe(true);
		expect(canTransition(idea({ tipe: "konsep" }), "tumbuh", off).ok).toBe(true);
		expect(canTransition(idea({ status: "tumbuh" }), "matang", off).ok).toBe(true);
	});
	it("tumbuh->matang needs devil for ide; konsep only if devilForKonsep", () => {
		expect(canTransition(idea({ status: "tumbuh" }), "matang", S)).toEqual({ ok: false, requiredGate: "devil" });
		expect(canTransition(idea({ tipe: "konsep", status: "tumbuh" }), "matang", S).ok).toBe(true);
		const on = mergeSettings({ devilForKonsep: true });
		expect(canTransition(idea({ tipe: "konsep", status: "tumbuh" }), "matang", on).requiredGate).toBe("devil");
	});
	it("matang->tumbuh, any->dibuang, dibuang->benih are always ok", () => {
		expect(canTransition(idea({ status: "matang" }), "tumbuh", S).ok).toBe(true);
		for (const st of ["benih", "tumbuh", "matang"] as const) {
			expect(canTransition(idea({ status: st }), "dibuang", S).ok).toBe(true);
		}
		expect(canTransition(idea({ status: "dibuang" }), "benih", S).ok).toBe(true);
	});
	it("rejects skipping, same status, and restoring to a non-benih status", () => {
		expect(canTransition(idea(), "matang", S).reason).toBe("skip-not-allowed");
		expect(canTransition(idea(), "benih", S).reason).toBe("same-status");
		expect(canTransition(idea({ status: "dibuang" }), "tumbuh", S).reason).toBe("restore-first");
		expect(canTransition(idea({ status: "tumbuh" }), "benih", S).reason).toBe("skip-not-allowed");
	});
	it("an empty registry never requires a gate (Fase 1 behaviour)", () => {
		expect(canTransition(idea(), "tumbuh", S, new GateRegistry()).ok).toBe(true);
	});
});

describe("applyPatchFor", () => {
	it("sets status, review date, adds gate once", () => {
		const p = applyPatchFor(idea({ gerbang: ["socratic"] }), "tumbuh", "2026-11-11", S, "socratic");
		expect(p).toEqual({ status: "tumbuh", tinjau: "2026-11-25", gerbang: ["socratic"] });
		const q = applyPatchFor(idea(), "tumbuh", "2026-11-11", S, "socratic");
		expect(q.gerbang).toEqual(["socratic"]);
	});
	it("dibuang clears review date", () => {
		expect(applyPatchFor(idea(), "dibuang", "2026-11-11", S).tinjau).toBeNull();
	});
});
