import { describe, expect, it } from "vitest";
import { applyPatch, parseIdeaNote } from "../src/domain/frontmatter";
import { applyPatchFor } from "../src/domain/transition";
import { appendBlock, escapeCalloutLine, formatCallout } from "../src/domain/callout";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { premortemPassed } from "../src/domain/v08";
import type { Idea } from "../src/domain/types";

const fmOf = () => ({ type: "idea", status: "mature", created: "2026-11-01", review: "2026-12-01", gates: ["socratic", "devil", "premortem"], author: "Ada" });
function ideaOf(fm: Record<string, unknown>): Idea {
	const r = parseIdeaNote("A.md", "A", fm);
	if (r.kind !== "idea") throw new Error("not idea");
	return r.idea;
}

describe("8a G-1: unknown gates survive every transition", () => {
	it("parseIdeaNote exposes unknown gates separately and keeps known ones typed", () => {
		const i = ideaOf(fmOf());
		expect(i.gerbang).toEqual(["socratic", "devil"]);
		expect(i.gerbangLain).toEqual(["premortem"]);
		expect(ideaOf({ ...fmOf(), gates: ["socratic"] }).gerbangLain).toBeUndefined();
	});
	for (const [name, to] of [["Reopen", "tumbuh"], ["Discard", "dibuang"], ["Restore", "benih"], ["Promote", "matang"]] as const) {
		it(`${name} keeps premortem, other unknown values, and other properties`, () => {
			const fm: Record<string, unknown> = { ...fmOf(), gates: ["socratic", "premortem", "future"] };
			applyPatch(fm, applyPatchFor(ideaOf(fm), to, "2026-11-13", DEFAULT_SETTINGS));
			expect(fm.gates).toEqual(["socratic", "premortem", "future"]);
			expect(fm.author).toBe("Ada");
		});
	}
	it("a passed known gate is added without losing unknown ones; no duplicates", () => {
		const fm: Record<string, unknown> = { ...fmOf(), gates: ["premortem"] };
		applyPatch(fm, applyPatchFor(ideaOf(fm), "tumbuh", "2026-11-13", DEFAULT_SETTINGS, "socratic"));
		expect(fm.gates).toEqual(["socratic", "premortem"]);
		applyPatch(fm, { addGates: ["premortem"] });
		applyPatch(fm, { addGates: ["premortem"] });
		expect(fm.gates).toEqual(["socratic", "premortem"]);
	});
	it("a string-valued gates property is handled", () => {
		const fm: Record<string, unknown> = { ...fmOf(), gates: "premortem" };
		applyPatch(fm, { addGates: ["premortem"] });
		expect(fm.gates).toEqual(["premortem"]);
	});
});

describe("8a: callout format v1 escaping", () => {
	it("escapes a leading [! in answers, continuation lines, and questions", () => {
		const block = formatCallout("premortem", "Pre-mortem", "2026-11-13", [{ label: "Cause", question: "[!note] q?", answer: "[!note] first\n[!warning]\n  [!x] third", source: "Bank" }], "Answer");
		const lines = block.split("\n");
		expect(lines.filter((l) => /^> \[!/.test(l))).toEqual(["> [!premortem]- Pre-mortem — 2026-11-13"]);
		expect(block).toContain("> Answer: \\[!note] first");
		expect(block).toContain("> \\[!warning]");
		expect(block).toContain(">   \\[!x] third");
	});
	it("does not touch [! in the middle of a line", () => {
		expect(escapeCalloutLine("see [!note] here")).toBe("see [!note] here");
	});
	it("supports extra lines and meta for retrieval", () => {
		const block = formatCallout("retrieval", "Retrieval", "2026-11-13", [{ label: "Recall", question: "Q?", answer: "new", source: "Bank", meta: ["forgot"], extra: [{ label: "Earlier answer", text: "old\nmore" }] }], "Answer");
		expect(block).toBe("> [!retrieval]- Retrieval — 2026-11-13\n> **Recall** · Bank · forgot\n> Q?\n> Answer: new\n> Earlier answer: old\n> more");
	});
	it("appendBlock only adds", () => {
		expect(appendBlock("body", "> [!premortem]- x").startsWith("body\n\n")).toBe(true);
	});
});

describe("8a: pre-mortem pass rule and settings", () => {
	it("2 long answers do not pass, 3 do; whitespace-only and short answers do not count", () => {
		const a = "y".repeat(20);
		expect(premortemPassed([a, a, "", " ".repeat(30), "short"], 3, 20)).toEqual({ passed: false, done: 2 });
		expect(premortemPassed([a, a, a], 3, 20).passed).toBe(true);
		expect(premortemPassed([a, a], 2, 20).passed).toBe(true);
	});
	it("settings: defaults and sanitising of the new groups", () => {
		const d = mergeSettings(undefined);
		expect(d.premortem).toEqual({ enabled: true, minAnswered: 3, minChars: 20 });
		expect(d.connect.enabled).toBe(true);
		expect(d.digest.reminder).toEqual({ enabled: false, day: 1 });
		const m = mergeSettings({ premortem: { minAnswered: 99, enabled: false }, digest: { reminder: { enabled: true, day: 9 }, lastReminded: "oops" }, connect: { enabled: "x" } });
		expect(m.premortem.minAnswered).toBe(5);
		expect(m.premortem.enabled).toBe(false);
		expect(m.digest.reminder).toEqual({ enabled: true, day: 6 });
		expect(m.digest.lastReminded).toBe("");
		expect(m.connect.enabled).toBe(true);
	});
});
