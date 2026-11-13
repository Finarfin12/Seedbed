import { describe, expect, it } from "vitest";
import { CLI_SPECS } from "../src/adapter/ai/cliSpecs";
import { ProviderChain } from "../src/domain/ai/chain";
import type { AiProvider } from "../src/domain/ai/types";
describe("legacy CLI error formatting", () => {
 const cases: Array<[string, Record<string, unknown>, string]> = [
  ["string", { result: "problem" }, "problem"],
  ["object", { result: { secret: "dummy-secret" } }, "[object Object]"],
  ["array", { result: ["x", "y"] }, "x,y"],
  ["number", { result: 42 }, "42"],
  ["boolean", { result: false }, "false"],
  ["null fallback", { result: null, subtype: "fallback" }, "fallback"],
  ["missing", {}, "unknown"],
  ["truncation", { result: "x".repeat(250) }, "x".repeat(200)],
 ];
 it.each(cases)("preserves %s and falls back", async (_label, fields, expected) => {
   const raw = JSON.stringify({ is_error: true, ...fields });
   expect(() => CLI_SPECS.claude.parseOutput(raw)).toThrow(`claude error: ${expected}`);
   try { CLI_SPECS.claude.parseOutput(raw); } catch (e) { expect((e as Error).message).not.toContain("dummy-secret"); }
   const p: AiProvider = { id: "cli", label: { kind: "ai-cloud", name: "test" }, complete: async () => CLI_SPECS.claude.parseOutput(raw) };
   const r = await new ProviderChain([p], 1000).run({system: "", user: ""}, x => x);
   expect(r.value).toBeNull(); expect(r.attempts[0]?.error).toBe(`claude error: ${expected}`);
 });
});
