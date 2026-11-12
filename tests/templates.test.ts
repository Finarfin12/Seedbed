import { describe, expect, it } from "vitest";
import { applyPatch, DEFAULT_NAMES, parseIdeaNote } from "../src/domain/frontmatter";
import type { PropNames } from "../src/domain/frontmatter";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";
import {
	cleanFolder,
	coreTemplatesFolder,
	isEmptyValue,
	isInTemplateFolder,
	planAutofill,
	planTemplateFiles,
	resolveTemplateFolder,
	TEMPLATE_FILES,
	templateContent,
} from "../src/domain/templateFiles";

type FM = Record<string, unknown>;
const TODAY = "2026-11-12";

describe("isi templat", () => {
	it("idea: frontmatter dengan nama umum, created pakai variabel templat, review kosong, kerangka isi", () => {
		const c = templateContent("ide", DEFAULT_NAMES, "en");
		expect(c.startsWith("---\ntype: idea\nstatus: seed\ncreated: {{date:YYYY-MM-DD}}\nreview:\ngates: []\n---\n")).toBe(true);
		expect(c).toContain("Write your idea here");
		expect(c).not.toContain("feynman-hint");
	});
	it("concept: type concept + petunjuk Feynman (kedua bahasa)", () => {
		const en = templateContent("konsep", DEFAULT_NAMES, "en");
		const id = templateContent("konsep", DEFAULT_NAMES, "id");
		expect(en).toContain("type: concept\nstatus: seed\n");
		expect(en).toContain("[!feynman-hint]");
		expect(en).toContain("## My explanation");
		expect(id).toContain("## Penjelasanku");
		expect(templateContent("ide", DEFAULT_NAMES, "id")).toContain("Tulis idemu di sini");
	});
	it("mengikuti pemetaan nama properti di pengaturan", () => {
		const names: PropNames = { type: "kind", status: "stage", created: "date-created", review: "next review", gates: "passed", source: "url", origin: "from" };
		const c = templateContent("ide", names, "en");
		expect(c.startsWith("---\nkind: idea\nstage: seed\ndate-created: {{date:YYYY-MM-DD}}\nnext review:\npassed: []\n---\n")).toBe(true);
		expect(c).not.toMatch(/^type:|^status:/m);
	});
	it("isi templat yang sudah disubstitusi terbaca sebagai ide benih oleh parser", () => {
		const filled = templateContent("ide", DEFAULT_NAMES, "en").replace("{{date:YYYY-MM-DD}}", TODAY);
		const fm: FM = { type: "idea", status: "seed", created: TODAY, review: null, gates: [] };
		expect(filled).toContain(`created: ${TODAY}`);
		expect(parseIdeaNote("a.md", "a", fm).kind).toBe("idea");
	});
});

describe("folder templat", () => {
	it("pengaturan > plugin inti Templates > Templates", () => {
		expect(resolveTemplateFolder("My Templates", "Core")).toBe("My Templates");
		expect(resolveTemplateFolder("", "Core/Sub")).toBe("Core/Sub");
		expect(resolveTemplateFolder("", "")).toBe("Templates");
		expect(resolveTemplateFolder(undefined, undefined)).toBe("Templates");
	});
	it("templates.json dibaca aman; isi rusak atau berbahaya jatuh ke bawaan", () => {
		expect(coreTemplatesFolder('{"folder":"Sablon"}')).toBe("Sablon");
		expect(coreTemplatesFolder('{"folder":"/Sablon/"}')).toBe("Sablon");
		expect(coreTemplatesFolder("{rusak")).toBe("");
		expect(coreTemplatesFolder(null)).toBe("");
		expect(coreTemplatesFolder('{"folder":"../luar"}')).toBe("");
		expect(coreTemplatesFolder('{"folder":42}')).toBe("");
		expect(resolveTemplateFolder("../../Windows", "")).toBe("Templates");
		expect(cleanFolder("a\\b//c/")).toBe("a/b/c");
	});
	it("pengaturan: folder dibersihkan, offered default false", () => {
		expect(DEFAULT_SETTINGS.templates).toEqual({ folder: "", offered: false });
		expect(mergeSettings({ templates: { folder: " Sablon/Idea ", offered: true } }).templates).toEqual({ folder: "Sablon/Idea", offered: true });
		expect(mergeSettings({ templates: { folder: "../x", offered: "ya" } }).templates).toEqual({ folder: "", offered: false });
	});
});

describe("berkas templat bukan catatan", () => {
	it("path di folder templat dikecualikan (tanpa beda huruf besar/kecil, termasuk subfolder); lainnya tidak", () => {
		expect(isInTemplateFolder("Sablon/Seedbed Idea.md", "Sablon")).toBe(true);
		expect(isInTemplateFolder("sablon/Sub/x.md", "Sablon")).toBe(true);
		expect(isInTemplateFolder("Sablon extra/x.md", "Sablon")).toBe(false);
		expect(isInTemplateFolder("Ide/Seedbed Idea.md", "Sablon")).toBe(false);
		expect(isInTemplateFolder("Sablon.md", "Sablon")).toBe(false);
		expect(isInTemplateFolder("Ide/a.md", "")).toBe(false);
	});
	it("isi templat dengan variabel tetap terbaca sebagai ide oleh parser (itu sebabnya folder harus dikecualikan)", () => {
		const asYaml = { type: "idea", status: "seed", created: { "{date:YYYY-MM-DD": null }, review: null };
		expect(parseIdeaNote("Sablon/x.md", "x", asYaml).kind).toBe("idea");
	});
});

describe("rencana pembuatan berkas: tidak pernah menimpa", () => {
	it("keduanya dibuat bila belum ada, di folder kustom", () => {
		const p = planTemplateFiles("Sablon", ["Ide/a.md"]);
		expect(p.create).toEqual([
			{ tipe: "ide", path: `Sablon/${TEMPLATE_FILES.ide}` },
			{ tipe: "konsep", path: `Sablon/${TEMPLATE_FILES.konsep}` },
		]);
		expect(p.skip).toEqual([]);
	});
	it("berkas yang sudah ada dilewati (tanpa beda huruf besar/kecil), yang lain tetap dibuat", () => {
		const p = planTemplateFiles("Templates", ["templates/seedbed idea.md"]);
		expect(p.skip).toEqual(["Templates/Seedbed Idea.md"]);
		expect(p.create.map((x) => x.path)).toEqual(["Templates/Seedbed Concept.md"]);
		const all = planTemplateFiles("Templates", ["Templates/Seedbed Idea.md", "Templates/Seedbed Concept.md"]);
		expect(all.create).toEqual([]);
		expect(all.skip).toHaveLength(2);
	});
});

describe("isi otomatis created/review kosong", () => {
	const S = DEFAULT_SETTINGS;
	it("nilai kosong = null, undefined, teks kosong", () => {
		expect(isEmptyValue(null)).toBe(true);
		expect(isEmptyValue(undefined)).toBe(true);
		expect(isEmptyValue("  ")).toBe(true);
		expect(isEmptyValue("2026-11-12")).toBe(false);
		expect(isEmptyValue([])).toBe(false);
		expect(isEmptyValue(new Date())).toBe(false);
	});
	it("catatan dari templat (review kosong): review = hari ini + interval benih; created terisi tidak disentuh", () => {
		const patch = planAutofill({ type: "idea", status: "seed", created: "2026-11-01", review: null, gates: [] }, DEFAULT_NAMES, TODAY, S);
		expect(patch).toEqual({ tinjau: "2026-11-19" });
	});
	it("created dan review kosong dua-duanya diisi; interval mengikuti status", () => {
		expect(planAutofill({ type: "idea", status: "seed", created: null, review: "" }, DEFAULT_NAMES, TODAY, S)).toEqual({ dibuat: TODAY, tinjau: "2026-11-19" });
		const grow = planAutofill({ type: "concept", status: "growing", review: null }, DEFAULT_NAMES, TODAY, S);
		expect(grow?.tinjau).toBeDefined();
		expect(grow?.dibuat).toBeUndefined();
	});
	it("yang sudah terisi tidak diubah; properti yang tidak ada sama sekali tidak dibuat", () => {
		expect(planAutofill({ type: "idea", status: "seed", created: "2026-01-01", review: "2026-02-02" }, DEFAULT_NAMES, TODAY, S)).toBeNull();
		expect(planAutofill({ type: "idea", status: "seed" }, DEFAULT_NAMES, TODAY, S)).toBeNull();
		expect(planAutofill({ type: "idea", status: "seed", review: "besok" }, DEFAULT_NAMES, TODAY, S)).toBeNull(); // tidak kosong: bukan urusan isi otomatis
	});
	it("status dibuang tidak diberi review", () => {
		expect(planAutofill({ type: "idea", status: "discarded", review: null }, DEFAULT_NAMES, TODAY, S)).toBeNull();
	});
	it("catatan non-Seedbed tidak tersentuh walau created/review kosong", () => {
		for (const fm of [
			{ type: "book", status: "seed", created: null, review: null },
			{ status: "seed", created: null, review: null },
			{ created: null, review: null },
			{ type: "idea-ish", status: "seed", review: null },
			{ type: "idea", status: "draft", review: null }, // type sah, status asing: tidak valid, tidak diisi
			{ title: "x" },
		] as FM[]) {
			expect(planAutofill(fm, DEFAULT_NAMES, TODAY, S)).toBeNull();
		}
		expect(planAutofill(undefined, DEFAULT_NAMES, TODAY, S)).toBeNull();
		expect(planAutofill(null, DEFAULT_NAMES, TODAY, S)).toBeNull();
	});
	it("format lama (bengkel-*) tidak diisi otomatis", () => {
		expect(planAutofill({ "bengkel-tipe": "ide", "bengkel-status": "benih", "bengkel-tinjau": null }, DEFAULT_NAMES, TODAY, S)).toBeNull();
	});
	it("mengikuti nama kustom", () => {
		const names: PropNames = { ...DEFAULT_NAMES, type: "kind", review: "next review" };
		expect(planAutofill({ kind: "idea", status: "seed", "next review": null }, names, TODAY, S)).toEqual({ tinjau: "2026-11-19" });
		expect(planAutofill({ kind: "idea", status: "seed", review: null }, names, TODAY, S)).toBeNull();
	});
	it("TANPA LOOP: setelah patch diterapkan, rencana berikutnya null (dan penerapan kedua tidak berubah apa pun)", () => {
		const fm: FM = { type: "idea", status: "seed", created: null, review: null, gates: [], title: "Keep" };
		const patch = planAutofill(fm, DEFAULT_NAMES, TODAY, S);
		expect(patch).not.toBeNull();
		applyPatch(fm, patch ?? {}, DEFAULT_NAMES);
		expect(fm).toMatchObject({ created: TODAY, review: "2026-11-19", title: "Keep" });
		expect(planAutofill(fm, DEFAULT_NAMES, TODAY, S)).toBeNull();
		const after = JSON.stringify(fm);
		for (let i = 0; i < 5; i++) {
			const p = planAutofill(fm, DEFAULT_NAMES, TODAY, S);
			if (p) applyPatch(fm, p, DEFAULT_NAMES);
		}
		expect(JSON.stringify(fm)).toBe(after);
	});
	it("hasil isi otomatis tetap terbaca sebagai ide benih", () => {
		const fm: FM = { type: "idea", status: "seed", created: null, review: null };
		applyPatch(fm, planAutofill(fm, DEFAULT_NAMES, TODAY, S) ?? {}, DEFAULT_NAMES);
		const r = parseIdeaNote("a.md", "a", fm);
		expect(r.kind === "idea" && r.idea.status === "benih" && r.idea.tinjau === "2026-11-19" && r.idea.dibuat === TODAY).toBe(true);
	});
});
