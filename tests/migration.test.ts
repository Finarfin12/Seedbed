import { describe, expect, it } from "vitest";
import {
	applyPatch,
	checkName,
	DEFAULT_NAMES,
	hasLegacyProps,
	KEY,
	LEGACY_KEY,
	migrateLegacy,
	parseIdeaNote,
	planAdopt,
	sanitizeNames,
} from "../src/domain/frontmatter";
import type { PropNames } from "../src/domain/frontmatter";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import { newNoteContent } from "../src/domain/templates";

type FM = Record<string, unknown>;
const legacy = (): FM => ({
	title: "Keep me",
	tags: ["x", "y"],
	[LEGACY_KEY.type]: "ide",
	[LEGACY_KEY.status]: "benih",
	[LEGACY_KEY.created]: "2026-11-01",
	[LEGACY_KEY.review]: "2026-11-08",
	[LEGACY_KEY.gates]: ["socratic"],
	[LEGACY_KEY.source]: "https://a.b/c",
	[LEGACY_KEY.origin]: "capture",
	aliases: ["z"],
});
const kind = (fm: FM | undefined, names?: PropNames) => parseIdeaNote("n.md", "n", fm, names).kind;

describe("properti umum tanpa prefiks (0.7.0)", () => {
	it("nama bawaan dan nilai English; catatan baru ditulis dengan nama itu", () => {
		expect(Object.values(KEY)).toEqual(["type", "status", "created", "review", "gates", "source", "origin"]);
		const c = newNoteContent("ide", "2026-11-12", DEFAULT_SETTINGS, "id");
		expect(c).toContain("---\ntype: idea\nstatus: seed\ncreated: 2026-11-12\nreview: 2026-11-19\ngates: []\n---");
		expect(c).not.toMatch(/bengkel-|seedbed-/);
		expect(newNoteContent("konsep", "2026-11-12", DEFAULT_SETTINGS, "en", true)).toContain("type: concept");
	});

	it("membaca semua kombinasi nilai English", () => {
		for (const [tipeEn, tipe] of [["idea", "ide"], ["concept", "konsep"]] as const)
			for (const [stEn, st] of [["seed", "benih"], ["growing", "tumbuh"], ["mature", "matang"], ["discarded", "dibuang"]] as const) {
				const r = parseIdeaNote("a.md", "a", { type: tipeEn, status: stEn, review: "2026-12-01", gates: ["devil"] });
				expect(r.kind === "idea" && r.idea.tipe === tipe && r.idea.status === st && r.idea.tinjau === "2026-12-01" && r.idea.gerbang[0] === "devil").toBe(true);
			}
	});
});

describe("kepemilikan: hanya type idea/concept milik Seedbed", () => {
	const foreign: FM[] = [
		{ status: "done" },
		{ status: "seed" },
		{ type: "book", status: "done", created: "2026-01-01" },
		{ type: "note", status: "growing" },
		{ created: "2026-01-01", source: "https://clipper.example/x" },
		{ type: 5, status: {} },
		{ type: "Idea-ish", status: "seed" },
		{ type: "ide", status: "benih" }, // nilai Indonesia di kunci baru = bukan milik Seedbed
	];
	it("catatan lain diabaikan total: bukan ide, bukan 'tidak valid'", () => {
		for (const fm of foreign) expect(kind(fm)).toBe("none");
	});
	it("type idea/concept dengan status di luar daftar = tidak valid (tampil di bagian Tidak valid)", () => {
		for (const status of ["draft", "done", "abc", 7]) {
			const r = parseIdeaNote("a.md", "a", { type: "idea", status });
			expect(r.kind === "invalid" && r.invalid.reason).toBe(`status: ${String(status)}`);
		}
		expect(kind({ type: "concept" })).toBe("invalid");
	});
	it("tidak pernah ditulis: applyPatch tidak dipanggil untuk catatan lain, dan planAdopt menolak menimpa type/status orang lain", () => {
		for (const fm of [{ type: "book" }, { status: "done" }, { type: "book", status: "done" }, { "bengkel-status": "x" }]) {
			const p = planAdopt(fm, { tipe: "ide", status: "benih" });
			expect(p.ok).toBe(false);
		}
		const frozen: FM = { type: "book", status: "done", created: "2026-01-01" };
		const before = JSON.stringify(frozen);
		expect(planAdopt(frozen, { tipe: "ide", status: "benih", dibuat: "2026-11-12" }).ok).toBe(false);
		expect(JSON.stringify(frozen)).toBe(before);
	});
	it("planAdopt pada catatan polos menulis semuanya; created/review/gates yang sudah ada tidak ditimpa", () => {
		const ok = planAdopt({ title: "x" }, { tipe: "ide", status: "benih", dibuat: "2026-11-12", tinjau: "2026-11-19", gerbang: [] });
		expect(ok).toEqual({ ok: true, patch: { tipe: "ide", status: "benih", dibuat: "2026-11-12", tinjau: "2026-11-19", gerbang: [] } });
		const partial = planAdopt({ created: "2020-01-01", review: "x" }, { tipe: "ide", status: "benih", dibuat: "2026-11-12", tinjau: "2026-11-19", gerbang: [] });
		expect(partial).toEqual({ ok: true, patch: { tipe: "ide", status: "benih", gerbang: [] } });
	});
	it("created/review/gates/source/origin tanpa type idea/concept tidak membuat catatan dianggap milik Seedbed", () => {
		expect(kind({ created: "2026-01-01", review: "2026-02-01", gates: ["devil"], source: "https://a.b", origin: "capture" })).toBe("none");
	});
});

describe("nama properti bisa diatur", () => {
	const custom: PropNames = { type: "kind", status: "stage", created: "date-created", review: "next review", gates: "passed", source: "url", origin: "from" };
	it("membaca, menulis, dan membuat catatan dengan nama kustom; nama bawaan tidak lagi dikenali", () => {
		const r = parseIdeaNote("a.md", "a", { kind: "idea", stage: "mature", "date-created": "2026-11-01", "next review": "2026-12-01", passed: ["socratic"], from: "capture" }, custom);
		expect(r.kind === "idea" && r.idea).toMatchObject({ tipe: "ide", status: "matang", dibuat: "2026-11-01", tinjau: "2026-12-01", gerbang: ["socratic"], asal: "capture" });
		expect(kind({ type: "idea", status: "seed" }, custom)).toBe("none");
		const fm: FM = { kind: "idea", stage: "seed" };
		applyPatch(fm, { status: "tumbuh", tinjau: "2026-12-09", sumber: "https://x.y" }, custom);
		expect(fm).toEqual({ kind: "idea", stage: "growing", "next review": "2026-12-09", url: "https://x.y" });
		const c = newNoteContent("ide", "2026-11-12", { ...DEFAULT_SETTINGS, properties: custom }, "en");
		expect(c).toContain("---\nkind: idea\nstage: seed\ndate-created: 2026-11-12\nnext review: 2026-11-19\npassed: []\n---");
	});
	it("pengaturan: nama tidak sah atau kembar jatuh ke bawaan; nama sah dipakai", () => {
		expect(sanitizeNames({ type: "kind" })).toEqual({ ...DEFAULT_NAMES, type: "kind" });
		expect(sanitizeNames({ type: "a:b" })).toEqual(DEFAULT_NAMES);
		expect(sanitizeNames({ type: "x\ny" })).toEqual(DEFAULT_NAMES);
		expect(sanitizeNames({ type: "same", status: "Same" })).toEqual(DEFAULT_NAMES);
		expect(sanitizeNames("junk")).toEqual(DEFAULT_NAMES);
		expect(mergeSettings({ properties: { review: "due" } }).properties.review).toBe("due");
		expect(mergeSettings({}).properties).toEqual(DEFAULT_NAMES);
		expect(checkName(DEFAULT_NAMES, "type", "status")).toBe("duplicate");
		expect(checkName(DEFAULT_NAMES, "type", "")).toBe("invalid");
		expect(checkName(DEFAULT_NAMES, "type", "my type")).toBeNull();
	});
});

describe("membaca format lama", () => {
	it("0.6 (bengkel-*, nilai Indonesia)", () => {
		const r = parseIdeaNote("a.md", "a", legacy());
		expect(r.kind === "idea" && r.idea).toMatchObject({ tipe: "ide", status: "benih", dibuat: "2026-11-01", tinjau: "2026-11-08", gerbang: ["socratic"], asal: "capture" });
		const bad = parseIdeaNote("a.md", "a", { [LEGACY_KEY.type]: "xyz", [LEGACY_KEY.status]: "benih" });
		expect(bad.kind === "invalid" && bad.invalid.reason).toBe("bengkel-tipe: xyz");
		expect(kind({ [LEGACY_KEY.status]: "benih" })).toBe("invalid");
	});
	it("build pengembangan seedbed-* (nilai English)", () => {
		expect(kind({ "seedbed-type": "idea", "seedbed-status": "seed" })).toBe("idea");
		expect(kind({ "seedbed-type": "concept", "seedbed-status": "nope" })).toBe("invalid");
	});
	it("campuran: kunci baru menang per bidang", () => {
		const r = parseIdeaNote("a.md", "a", { type: "idea", [LEGACY_KEY.status]: "tumbuh", review: "2026-12-01", [LEGACY_KEY.review]: "2020-01-01" });
		expect(r.kind === "idea" && r.idea.tipe === "ide" && r.idea.status === "tumbuh" && r.idea.tinjau === "2026-12-01").toBe(true);
	});
});

describe("migrasi", () => {
	it("konversi penuh pada tempatnya; properti lain dan urutan terjaga; idempoten", () => {
		const fm = legacy();
		expect(hasLegacyProps(fm)).toBe(true);
		expect(migrateLegacy(fm)).toEqual({ changed: true, conflict: false });
		expect(Object.keys(fm)).toEqual(["title", "tags", "type", "status", "created", "review", "gates", "source", "origin", "aliases"]);
		expect(fm).toMatchObject({ title: "Keep me", aliases: ["z"], type: "idea", status: "seed", review: "2026-11-08", gates: ["socratic"] });
		const snap = JSON.stringify(fm);
		expect(hasLegacyProps(fm)).toBe(false);
		expect(migrateLegacy(fm)).toEqual({ changed: false, conflict: false });
		expect(JSON.stringify(fm)).toBe(snap);
	});
	it("kunci bengkel-* yang tidak dikenal dan Date dibiarkan", () => {
		const fm: FM = { ...legacy(), "bengkel-kustom": "jangan sentuh", [LEGACY_KEY.review]: new Date("2026-11-08T00:00:00Z") };
		migrateLegacy(fm);
		expect(fm["bengkel-kustom"]).toBe("jangan sentuh");
		expect(fm.review).toEqual(new Date("2026-11-08T00:00:00Z"));
	});
	it("nilai asing disalin apa adanya (tetap tidak valid, tidak diam-diam diperbaiki)", () => {
		const fm: FM = { [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "abc" };
		migrateLegacy(fm);
		expect(fm).toEqual({ type: "idea", status: "abc" });
		expect(kind(fm)).toBe("invalid");
	});
	it("KONFLIK: properti tujuan sudah berisi nilai lain => catatan dilewati, tidak ada yang berubah", () => {
		for (const fm of [
			{ [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "benih", status: "draft" },
			{ [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "benih", type: "book" },
			{ [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "benih", created: "1999-01-01", [LEGACY_KEY.created]: "2026-11-01" },
			{ [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "benih", source: "https://other.example" , [LEGACY_KEY.source]: "https://a.b/c" },
		] as FM[]) {
			const before = JSON.stringify(fm);
			expect(migrateLegacy(fm)).toEqual({ changed: false, conflict: true });
			expect(JSON.stringify(fm)).toBe(before);
		}
	});
	it("type lama yang tidak dikenal dilewati supaya catatan tetap tampil tidak valid", () => {
		const fm: FM = { [LEGACY_KEY.type]: "xyz", [LEGACY_KEY.status]: "benih" };
		const before = JSON.stringify(fm);
		expect(migrateLegacy(fm)).toEqual({ changed: false, conflict: true });
		expect(JSON.stringify(fm)).toBe(before);
		expect(kind(fm)).toBe("invalid");
	});
	it("tujuan sudah ada dengan nilai yang SAMA: bukan konflik, kunci lama cukup dibuang", () => {
		const fm: FM = { [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "tumbuh", type: "idea", status: "growing" };
		expect(migrateLegacy(fm)).toEqual({ changed: true, conflict: false });
		expect(fm).toEqual({ type: "idea", status: "growing" });
	});
	it("migrasi memakai nama kustom sebagai tujuan", () => {
		const names: PropNames = { ...DEFAULT_NAMES, type: "kind", status: "stage" };
		const fm = legacy();
		migrateLegacy(fm, names);
		expect(fm).toMatchObject({ kind: "idea", stage: "seed", created: "2026-11-01" });
		expect("type" in fm).toBe(false);
		expect(parseIdeaNote("a.md", "a", fm, names).kind).toBe("idea");
	});
	it("catatan non-Seedbed tidak tersentuh migrasi", () => {
		for (const fm of [{ type: "book", status: "done", created: "2026-01-01" }, { status: "draft" }, { title: "x" }] as FM[]) {
			const before = JSON.stringify(fm);
			expect(hasLegacyProps(fm)).toBe(false);
			expect(migrateLegacy(fm)).toEqual({ changed: false, conflict: false });
			expect(JSON.stringify(fm)).toBe(before);
		}
	});
	it("applyPatch pada catatan lama mengonversi milik Seedbed saja; konflik melempar dan tidak mengubah apa pun", () => {
		const fm = legacy();
		applyPatch(fm, { status: "tumbuh", tinjau: "2026-11-20" });
		expect(Object.keys(fm).some((k) => k.startsWith("bengkel-"))).toBe(false);
		expect(fm).toMatchObject({ title: "Keep me", tags: ["x", "y"], aliases: ["z"], type: "idea", status: "growing", review: "2026-11-20" });
		const clash: FM = { [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "benih", status: "draft" };
		const before = JSON.stringify(clash);
		expect(() => applyPatch(clash, { status: "tumbuh" })).toThrow();
		expect(JSON.stringify(clash)).toBe(before);
		const gone: FM = legacy();
		applyPatch(gone, { status: "dibuang", tinjau: null });
		expect("review" in gone || LEGACY_KEY.review in gone).toBe(false);
	});
	it("migrasi tidak mengubah jumlah/ciri ide yang terbaca (sebelum = sesudah)", () => {
		const notes: FM[] = [
			legacy(),
			{ [LEGACY_KEY.type]: "konsep", [LEGACY_KEY.status]: "matang" },
			{ [LEGACY_KEY.type]: "ide", [LEGACY_KEY.status]: "dibuang", [LEGACY_KEY.review]: "besok" },
			{ [LEGACY_KEY.type]: "xyz", [LEGACY_KEY.status]: "benih" },
			{ title: "bukan ide" },
			{ type: "idea", status: "seed" },
			{ type: "book", status: "done" },
		];
		const read = (n: FM[]) => n.map((fm, i) => { const r = parseIdeaNote(`n${i}.md`, `n${i}`, fm); return JSON.stringify(r.kind === "idea" ? r.idea : r.kind); });
		const before = read(notes);
		for (const fm of notes) migrateLegacy(fm);
		expect(read(notes)).toEqual(before);
		// hanya catatan type "xyz" (dilewati karena tidak dikenal) yang masih berformat lama
		expect(notes.filter((fm) => hasLegacyProps(fm))).toHaveLength(1);
	});
});
