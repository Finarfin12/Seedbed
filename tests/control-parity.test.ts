import { describe, expect, it } from "vitest";
import { normalizeBlock, normalizeLine, captureFileBase } from "../src/domain/captureValidator";
import { cleanFolder } from "../src/domain/templateFiles";
import { validateQuestion } from "../src/domain/ai/outputValidator";
const codes = [...Array.from({ length: 32 }, (_, i) => i), 127, 0x2028, 0x2029, ...Array.from({ length: 5 }, (_, i) => 0x202a + i), ...Array.from({ length: 4 }, (_, i) => 0x2066 + i)];
const originalCapture = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g;
const originalAI = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
describe("control character parity with 0.8.2", () => {
  it.each(codes)("matches old capture, template and AI rules for code %i", code => {
    const ch = String.fromCharCode(code); const input = `Ab${ch}Cd`;
    const block = input.replace(/\r\n?/g, "\n").replace(originalCapture, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const line = input.replace(originalCapture, "").replace(/\s+/g, " ").trim();
    expect(normalizeBlock(input)).toBe(block); expect(normalizeLine(input)).toBe(line);
    const name = input.replace(originalCapture, " ").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
    expect(captureFileBase({text: "x", truncated: false, title: input, q: "", a: "", lang: "en"}, "2026-01-01")).toBe(name);
    const trimmed = input.trim(); const forbidden = /[\u0000-\u001f<>:"|?*]/.test(trimmed);
    expect(cleanFolder(input)).toBe(forbidden ? "" : trimmed);
    const q = `What${ch} now?`; const expected = !originalAI.test(q.trim().replace(/\s+/g, " "));
    expect(validateQuestion(q) !== null).toBe(expected);
  });
});
