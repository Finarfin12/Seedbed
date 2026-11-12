// Integrasi domain terhadap fixture vault uji. Fixture dibuat segar di folder sementara tiap kali tes jalan,
// jadi uji manual di test-vault/ (yang mengubah catatan) tidak memengaruhi hasil tes.
// Parser YAML sungguhan (paket "yaml") menggantikan metadataCache Obsidian; ini BUKAN uji di aplikasi Obsidian.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generate } from "../scripts/gen-test-vault.mjs";
import { toISODate } from "../src/domain/dates";
import { analyze } from "../src/domain/feynman/analyzer";
import { parseIdeaNote } from "../src/domain/frontmatter";
import { DEFAULT_SETTINGS } from "../src/domain/settings";
import { isDue } from "../src/domain/scheduler";
import { canTransition } from "../src/domain/stateMachine";
import type { Idea, ParsedNote } from "../src/domain/types";

const root = mkdtempSync(join(tmpdir(), "bengkel-vault-"));
generate(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		if (n === ".obsidian") return [];
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
	});
}

function frontmatterOf(text: string): Record<string, unknown> | undefined {
	const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!m) return undefined;
	const v: unknown = parse(m[1] as string);
	return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

const files = walk(root);
const rel = (f: string) => relative(root, f).replace(/\\/g, "/");
const text = (f: string) => readFileSync(f, "utf8");

describe("test-vault fixtures", () => {
	const parsed = new Map<string, ParsedNote>();
	const terms: string[] = [];
	beforeAll(() => {
		for (const f of files) {
			const fm = frontmatterOf(text(f));
			parsed.set(rel(f), parseIdeaNote(rel(f), basename(f, ".md"), fm));
			terms.push(basename(f, ".md"));
			const al = fm?.aliases;
			if (Array.isArray(al)) terms.push(...al.map(String));
		}
	});

	it("has about 20 sample notes", () => {
		expect(files.length).toBeGreaterThanOrEqual(20);
	});

	it("classifies notes: 12 valid ideas/concepts, 2 invalid, rest are plain", () => {
		const kinds = [...parsed.values()].map((p) => p.kind);
		expect(kinds.filter((k) => k === "idea")).toHaveLength(12);
		expect(kinds.filter((k) => k === "invalid")).toHaveLength(2);
		expect(parsed.get("Ide/Status salah.md")?.kind).toBe("invalid");
		expect(parsed.get("Ide/Tipe salah.md")?.kind).toBe("invalid");
		expect(parsed.get("Catatan harian.md")?.kind).toBe("none");
	});

	it("due list matches the fixtures (relative to today)", () => {
		const today = toISODate(new Date());
		const ideas = [...parsed.values()].flatMap((p) => (p.kind === "idea" ? [p.idea] : []));
		const due = ideas.filter((i) => isDue(i, today)).map((i) => i.path).sort();
		// Fixture yang tanggalnya di masa lalu/hari ini/rusak selalu jatuh tempo (aman seiring waktu);
		// yang di masa depan bisa ikut jatuh tempo kalau vault lama, jadi tidak dicek di sini.
		for (const p of [
			"Ide/Aplikasi jurnal kebiasaan.md",
			"Ide/Komunitas baca buku.md",
			"Ide/Podcast pemula.md",
			"Ide/Jatuh tempo hari ini.md",
			"Ide/Tanggal rusak.md",
		]) {
			expect(due, p).toContain(p);
		}
		expect(due).not.toContain("Ide/Plugin kalender.md");
	});

	it("a valid idea parses with gates from the real YAML list syntax", () => {
		const p = parsed.get("Ide/Podcast pemula.md");
		expect(p?.kind === "idea" && p.idea.gerbang).toEqual(["socratic", "devil"]);
	});

	it("gate requirements on fixtures", () => {
		const get = (path: string): Idea => {
			const p = parsed.get(path);
			if (p?.kind !== "idea") throw new Error(path);
			return p.idea;
		};
		expect(canTransition(get("Ide/Aplikasi jurnal kebiasaan.md"), "tumbuh", DEFAULT_SETTINGS).requiredGate).toBe("socratic");
		expect(canTransition(get("Ide/Alat catat rapat.md"), "matang", DEFAULT_SETTINGS).requiredGate).toBe("devil");
		expect(canTransition(get("Ide/Podcast pemula.md"), "tumbuh", DEFAULT_SETTINGS).ok).toBe(true);
		expect(canTransition(get("Konsep/Feynman - Entropi.md"), "tumbuh", DEFAULT_SETTINGS).requiredGate).toBe("feynman");
		expect(canTransition(get("Konsep/Basis data (konsep).md"), "matang", DEFAULT_SETTINGS).ok).toBe(true);
	});

	it("Feynman: bad explanation has term gaps + a long sentence; good one is clean", () => {
		const entropi = join(root, "Konsep", "Feynman - Entropi.md");
		const rekursi = join(root, "Konsep", "Feynman - Rekursi.md");
		const own = (f: string) => terms.filter((t) => t !== basename(f, ".md"));

		const bad = analyze(text(entropi), own(entropi), DEFAULT_SETTINGS);
		const badTerms = bad.filter((g) => g.kind === "term").map((g) => g.key).sort();
		expect(badTerms).toEqual(["algoritma", "basis data", "entropi", "kompleksitas"]);
		expect(bad.some((g) => g.kind === "sentence")).toBe(true);

		const good = analyze(text(rekursi), own(rekursi), DEFAULT_SETTINGS);
		expect(good.filter((g) => g.kind === "term")).toEqual([]);
	});

	it("code blocks in the fixture do not create gaps", () => {
		const f = join(root, "Referensi", "Catatan dengan kode.md");
		expect(analyze(text(f), terms.filter((t) => t !== "Catatan dengan kode"), DEFAULT_SETTINGS)).toEqual([]);
	});
});
