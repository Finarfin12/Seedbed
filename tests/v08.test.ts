import { describe, expect, it } from "vitest";
import { applyPatch } from "../src/domain/frontmatter";
import { analyze, maskText } from "../src/domain/feynman/analyzer";
import { DEFAULT_SETTINGS } from "../src/domain/settings";
import { premortemBankSize, premortemPassed, parseQaPairs, retrievalReview } from "../src/domain/v08";

describe("0.8 domain recovery", () => {
  it("preserves unknown gates across updates and adds premortem once", () => {
    const fm: Record<string, unknown> = { gates: ["socratic", "premortem", "future-gate"], author: "Ada" };
    applyPatch(fm, { gerbang: ["socratic", "devil"], addGates: ["premortem"] });
    expect(fm.gates).toEqual(["socratic", "devil", "premortem", "future-gate"]);
    expect(fm.author).toBe("Ada");
  });
  it("masks new callouts and flags empty and circular definitions", () => {
    for (const type of ["retrieval", "premortem", "feynman-hint", "connect"]) {
      expect(maskText(`> [!${type}]- Test\n> entropy is important`)).not.toContain("entropy");
    }
    expect(analyze("Entropy is an important thing.", ["entropy"], DEFAULT_SETTINGS, []).find(g => g.kind === "term")?.weak).toBe("empty");
    expect(analyze("Entropy is entropy.", ["entropy"], DEFAULT_SETTINGS, []).find(g => g.kind === "term")?.weak).toBe("circular");
  });
  it("requires three sufficiently long premortem answers and supports both languages", () => {
    expect(premortemBankSize("en").every(n => n >= 3)).toBe(true);
    expect(premortemBankSize("id").every(n => n >= 3)).toBe(true);
    expect(premortemPassed(["x".repeat(20), "x".repeat(20), "short"], 3, 20).passed).toBe(false);
    expect(premortemPassed(Array(3).fill("x".repeat(20)), 3, 20).passed).toBe(true);
  });
  it("extracts old questions and adjusts dates only on self-rating", () => {
    const pairs = parseQaPairs("> [!socratic]- Session\n> **Assumptions**\n> What do you assume?\n> Answer: I assume people have enough time.");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.question).toBe("What do you assume?");
    expect(retrievalReview("benih", "forgot", "2026-11-13", DEFAULT_SETTINGS)).toBe("2026-11-17");
  });
});
