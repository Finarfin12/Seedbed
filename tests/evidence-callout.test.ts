import { describe, expect, it } from "vitest";
import { analyze, maskText } from "../src/domain/feynman/analyzer";
import { applyPatch } from "../src/domain/frontmatter";
import { DEFAULT_SETTINGS } from "../src/domain/settings";
import { applyPatchFor } from "../src/domain/transition";
import { parseIdeaNote } from "../src/domain/frontmatter";

const evidence = [
	"> [!evidence]- Evidence — 2026-11-13",
	"> **Claim** · AI · skill (Claude Code)",
	"> Latency is whatever the user feels.",
	">",
	"> **Source 1** · A · official",
	"> Latency — Example Org, Ada, 2025-01-01",
	"> <https://example.org/latency> (accessed 2026-11-13)",
	'> Quote: "Latency is the delay between a request and its response; entropy is disorder."',
	"> Does this support, contradict, or not relate to your claim? Which part?",
	"> Answer: Latency is a thing and entropy is a thing too.",
].join("\n");
const terms = (text: string) => analyze(text, ["latency", "entropy"], DEFAULT_SETTINGS, []).filter((g) => g.kind === "term");

describe("0.8.2 [!evidence] is not analysed by the Feynman analyzer", () => {
	it("its text neither creates gaps nor counts as an explanation", () => {
		expect(terms(evidence)).toEqual([]);
		expect(maskText(evidence)).not.toMatch(/latency|entropy/i);
		// a real explanation outside the callout still counts, and a bare term outside it is still a gap
		expect(terms("Latency is the delay between a request and its response.\n\n" + evidence).map((g) => g.term.toLowerCase())).toEqual([]);
		expect(terms("We talk about latency here.\n\n" + evidence).map((g) => g.term.toLowerCase())).toEqual(["latency"]);
	});
	it("a definition that exists only inside the callout does not close a gap in the body", () => {
		expect(terms("We use latency a lot.\n\n> [!evidence]- E\n> Latency is the delay between a request and a response.").map((g) => g.term.toLowerCase())).toEqual(["latency"]);
	});
	it("the callout type is matched case-insensitively and stops at the first non-quote line", () => {
		expect(terms("> [!Evidence]- E\n> latency here\n\nlatency after the callout")).toHaveLength(1);
	});
});

describe("0.8.2 evidence never touches properties", () => {
	it("a note that carries an evidence callout keeps its gates through Promote/Reopen patches", () => {
		const fm: Record<string, unknown> = { type: "concept", status: "mature", created: "2026-11-01", review: "2026-12-01", gates: ["feynman", "premortem"], author: "Ada" };
		const r = parseIdeaNote("A.md", "A", fm);
		if (r.kind !== "idea") throw new Error("not idea");
		applyPatch(fm, applyPatchFor(r.idea, "tumbuh", "2026-11-13", DEFAULT_SETTINGS));
		expect(fm.gates).toEqual(["feynman", "premortem"]);
		expect(fm.author).toBe("Ada");
	});
});
