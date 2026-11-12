import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { id } from "../src/i18n/id";
import { interpolate, makeT } from "../src/i18n";

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

describe("i18n", () => {
	it("id and en have exactly the same keys", () => {
		expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
	});
	it("every key has the same {placeholders} in both languages and no empty text", () => {
		for (const key of Object.keys(id) as Array<keyof typeof id>) {
			expect(placeholders(en[key]), key).toEqual(placeholders(id[key]));
			expect(id[key].trim().length, key).toBeGreaterThan(0);
			expect(en[key].trim().length, key).toBeGreaterThan(0);
		}
	});
	it("interpolate replaces known vars and keeps unknown ones", () => {
		expect(interpolate("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
		expect(interpolate("plain")).toBe("plain");
	});
	it("makeT switches language", () => {
		expect(makeT("id")("btn.discard")).toBe("Buang");
		expect(makeT("en")("btn.discard")).toBe("Discard");
		expect(makeT("en")("btn.snooze", { n: 7 })).toBe("Snooze +7 days");
	});
	it("has a label for every question category", () => {
		for (const c of ["klarifikasi", "asumsi", "bukti", "sudutPandang", "implikasi", "pertanyaan", "kebalikan", "lawan", "kegagalan"]) {
			expect(`cat.${c}` in id, c).toBe(true);
		}
	});
});
