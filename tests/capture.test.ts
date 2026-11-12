import { describe, expect, it } from "vitest";
import {
	buildCaptureBody,
	captureFileBase,
	escapeBlockLine,
	escapeInline,
	LIMITS,
	markdownLinkUrl,
	normalizeBlock,
	planCapture,
	uniqueBase,
	sanitizeUrl,
	validateCapture,
} from "../src/domain/captureValidator";
import type { CaptureData, CaptureParams } from "../src/domain/captureValidator";
import { applyPatch, KEY, parseIdeaNote } from "../src/domain/frontmatter";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/domain/settings";

const OPTS = { maxText: 2000, defaultLang: "id" as const };
it("escapes nested quote markers so hostile text cannot open nested callouts", () => {
	for (const line of ["> [!danger] hostile", ">> [!tip] nested", "  > [!bug] x"]) {
		expect(escapeBlockLine(line)).not.toMatch(/^\s*>/);
		expect(escapeBlockLine(line)).toContain("\\>");
	}
});
const ok = (p: CaptureParams) => {
	const r = validateCapture(p, OPTS);
	if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
	return r.data;
};
const base = { v: "1", text: "Teks terpilih." };

describe("validateCapture: parameter", () => {
	it("versi harus '1'", () => {
		expect(validateCapture({ text: "x" }, OPTS)).toEqual({ ok: false, error: "bad-version" });
		expect(validateCapture({ v: "2", text: "x" }, OPTS)).toEqual({ ok: false, error: "bad-version" });
		expect(validateCapture({ v: "", text: "x" }, OPTS)).toEqual({ ok: false, error: "bad-version" });
		expect(validateCapture({ v: "01", text: "x" }, OPTS)).toEqual({ ok: false, error: "bad-version" });
	});
	it("text wajib dan tidak boleh hanya spasi/karakter kontrol", () => {
		expect(validateCapture({ v: "1" }, OPTS)).toEqual({ ok: false, error: "no-text" });
		expect(validateCapture({ v: "1", text: "   \n\t  " }, OPTS)).toEqual({ ok: false, error: "no-text" });
		expect(validateCapture({ v: "1", text: "\u0000\u0007\u001b" }, OPTS)).toEqual({ ok: false, error: "no-text" });
	});
	it("hanya text yang wajib; lainnya opsional dan default aman", () => {
		const d = ok(base);
		expect(d).toMatchObject({ text: "Teks terpilih.", truncated: false, title: "", q: "", a: "", lang: "id" });
		expect(d.url).toBeUndefined();
	});
	it("lang: hanya id/en, selain itu bahasa plugin", () => {
		expect(ok({ ...base, lang: "en" }).lang).toBe("en");
		expect(ok({ ...base, lang: "id" }).lang).toBe("id");
		expect(ok({ ...base, lang: "fr" }).lang).toBe("id");
		expect(ok({ ...base, lang: "EN" }).lang).toBe("id");
		expect(validateCapture({ ...base, lang: "x" }, { maxText: 10, defaultLang: "en" })).toMatchObject({ data: { lang: "en" } });
	});
	it("parameter tambahan yang tidak dikenal diabaikan (tidak masuk data)", () => {
		const d = ok({ ...base, evil: "x", file: "../../secret", folder: "C:/Windows" } as CaptureParams);
		expect(Object.keys(d).sort()).toEqual(["a", "lang", "q", "text", "title", "truncated", "url"].sort());
	});
});

describe("validateCapture: batas panjang dan normalisasi", () => {
	it("text dipotong ke batas dengan tanda; truncated=true", () => {
		const d = ok({ ...base, text: "a".repeat(5000) });
		expect(d.truncated).toBe(true);
		expect(d.text.endsWith("…(dipotong)")).toBe(true);
		expect(d.text.length).toBeLessThanOrEqual(2000 + "…(dipotong)".length);
		const exact = ok({ ...base, text: "b".repeat(2000) });
		expect(exact.truncated).toBe(false);
	});
	it("memotong per karakter Unicode, tidak merusak pasangan surrogate (emoji)", () => {
		const d = validateCapture({ ...base, text: "😀".repeat(50) }, { maxText: 5, defaultLang: "id" });
		expect(d.ok && d.data.text).toBe(`${"😀".repeat(5)}…(dipotong)`);
	});
	it("title 200, q 300, a 2000", () => {
		const d = ok({ ...base, title: "t".repeat(500), q: "q".repeat(900), a: "a".repeat(5000) });
		expect(d.title).toHaveLength(LIMITS.title);
		expect(d.q).toHaveLength(LIMITS.q);
		expect(d.a).toHaveLength(LIMITS.a);
	});
	it("baris baru: CRLF/CR dinormalisasi, baris kosong beruntun dirapikan, spasi ujung dibuang", () => {
		expect(normalizeBlock("a\r\nb\rc\n\n\n\n\nd  \n e")).toBe("a\nb\nc\n\nd\n e");
		expect(ok({ ...base, text: "  halo\r\ndunia  " }).text).toBe("halo\ndunia");
	});
	it("title/q satu baris: baris baru jadi spasi", () => {
		const d = ok({ ...base, title: "Judul\n# Heading\n> [!danger]", q: "Pertanyaan\r\nlain?" });
		expect(d.title).toBe("Judul # Heading > [!danger]");
		expect(d.q).toBe("Pertanyaan lain?");
	});
	it("karakter kontrol dan bidi override dibuang", () => {
		const d = ok({ ...base, text: "a\u0000b\u0007c\u202ed\u2066e\u2028f", title: "t\u0000i\u202et" });
		expect(d.text).toBe("abcdef");
		expect(d.title).toBe("tit");
	});
});

describe("sanitizeUrl", () => {
	it("hanya http/https", () => {
		expect(sanitizeUrl("https://contoh.com/a?b=1#c")).toBe("https://contoh.com/a?b=1#c");
		expect(sanitizeUrl("http://contoh.com")).toBe("http://contoh.com/");
		for (const bad of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			" javascript:alert(1)",
			"data:text/html,<script>alert(1)</script>",
			"file:///C:/Windows/system32/config/SAM",
			"obsidian://open?vault=x",
			"vbscript:msgbox",
			"ftp://x.y/z",
			"chrome://settings",
			"//contoh.com/tanpa-skema",
			"contoh.com",
			"",
			"   ",
		]) {
			expect(sanitizeUrl(bad), bad).toBeUndefined();
		}
	});
	it("menolak kredensial di URL dan URL terlalu panjang", () => {
		expect(sanitizeUrl("https://user:pass@contoh.com/")).toBeUndefined();
		expect(sanitizeUrl("https://user@contoh.com/")).toBeUndefined();
		expect(sanitizeUrl(`https://contoh.com/${"a".repeat(3000)}`)).toBeUndefined();
		expect(sanitizeUrl(undefined)).toBeUndefined();
	});
	it("url jahat tidak membatalkan tangkapan; hanya url dibuang", () => {
		const d = ok({ ...base, url: "javascript:alert(document.cookie)" });
		expect(d.url).toBeUndefined();
		expect(buildCaptureBody(d)).not.toMatch(/javascript/i);
	});
	it("tanda kurung URL di-encode supaya tautan Markdown tidak patah", () => {
		expect(markdownLinkUrl("https://id.wikipedia.org/wiki/Cache_(komputasi)")).toBe("https://id.wikipedia.org/wiki/Cache_%28komputasi%29");
	});
});

const D = (over: Partial<CaptureData> = {}): CaptureData => ({
	text: "Isi kutipan",
	truncated: false,
	title: "Judul Halaman",
	q: "",
	a: "",
	lang: "id",
	url: "https://contoh.com/artikel",
	...over,
});

describe("buildCaptureBody: struktur catatan", () => {
	it("format sesuai arsitektur §4.3 (kutipan + sumber + pemicu + jawaban)", () => {
		const body = buildCaptureBody(D({ q: "Bagian mana yang belum tentu benar?", a: "Angkanya." }));
		expect(body).toBe(
			[
				"> [!quote] Kutipan — Judul Halaman",
				"> Isi kutipan",
				"> — [Judul Halaman](https://contoh.com/artikel)",
				"",
				"> [!trigger] Pertanyaan pemicu",
				"> Bagian mana yang belum tentu benar?",
				"> Jawaban: Angkanya.",
				"",
			].join("\n"),
		);
	});
	it("tanpa pemicu/jawaban/url/judul: hanya kutipan", () => {
		expect(buildCaptureBody(D({ title: "", url: undefined }))).toBe("> [!quote] Kutipan\n> Isi kutipan\n");
	});
	it("jawaban kosong: pemicu tanpa baris Jawaban; hanya jawaban: pemicu tanpa pertanyaan", () => {
		expect(buildCaptureBody(D({ q: "Apa?" }))).not.toContain("Jawaban");
		const onlyA = buildCaptureBody(D({ a: "Catatanku" }));
		expect(onlyA).toContain("> [!trigger] Pertanyaan pemicu\n> Jawaban: Catatanku");
	});
	it("bahasa EN", () => {
		const b = buildCaptureBody(D({ lang: "en", q: "Why?", a: "Because." }));
		expect(b).toContain("> [!quote] Quote — Judul Halaman");
		expect(b).toContain("> [!trigger] Trigger question");
		expect(b).toContain("> Answer: Because.");
	});
	it("jawaban multibaris tetap di dalam callout", () => {
		const b = buildCaptureBody(D({ q: "Apa?", a: "baris satu\n\nbaris tiga" }));
		expect(b).toContain("> Jawaban: baris satu\n>\n> baris tiga");
	});
});

/** Setiap baris badan harus berupa blockquote: tidak ada teks halaman yang bisa berdiri di luar callout. */
function onlyQuotedOrBlank(body: string): boolean {
	return body.split("\n").every((l) => l === "" || l === ">" || l.startsWith("> "));
}
/** Callout yang dibuat = hanya baris `> [!quote]` dan `> [!trigger]` milik kita (maks. 1 masing-masing). */
function calloutHeaders(body: string): string[] {
	return body.split("\n").filter((l) => /^>\s*\[!/.test(l));
}

describe("buildCaptureBody: injeksi Markdown (NF-C4)", () => {
	const attacks: Array<[string, string]> = [
		["frontmatter palsu", "---\nstatus: mature\ngates:\n  - socratic\n  - devil\n---\nisi"],
		["frontmatter di baris pertama", "---\ntitle: x\n---"],
		["callout baru di tengah teks", "teks normal\n> [!danger] PERINGATAN\n> klik di sini"],
		["callout baru di awal", "[!warning] palsu"],
		["callout dengan spasi", "   [!bug] palsu"],
		["wikilink / embed", "lihat ![[Catatan Rahasia]] dan [[Catatan Lain]]"],
		["html + script", "<script>alert(1)</script><img src=x onerror=alert(1)>"],
		["komentar obsidian", "%% sembunyi %% teks"],
		["heading dan tabel", "# Judul Besar\n| a | b |\n|---|---|"],
		["fence kode tak tertutup", "```js\nkode tak tertutup"],
		["yaml di dalam teks", "status: mature"],
		["kutipan bersarang", "> [!tip] bersarang\n>> dalam"],
	];
	for (const [name, text] of attacks) {
		it(`teks: ${name}`, () => {
			const body = buildCaptureBody(D({ text }));
			expect(onlyQuotedOrBlank(body), body).toBe(true);
			expect(body.startsWith("> [!quote]")).toBe(true);
			expect(body.startsWith("---")).toBe(false);
			expect(calloutHeaders(body)).toEqual(["> [!quote] Kutipan — Judul Halaman"]);
			expect(body).not.toMatch(/(^|\n)>\s*\[!(danger|warning|bug|tip)/);
			expect(body).not.toContain("![[");
			expect(body).not.toMatch(/(^|[^\\])<\s*[a-z!/]/i); // setiap "<" ter-escape
			expect(body).not.toMatch(/(^|[^\\])\[\[/);
		});
	}
	it("judul jahat tidak menutup tautan, tidak membuat callout/heading, tetap satu baris", () => {
		const title = "Judul](javascript:alert(1)) [x\n> [!danger] baru\n# H";
		const body = buildCaptureBody(D({ title: normalizeBlock(title).replace(/\s+/g, " ") }));
		const lines = body.split("\n");
		expect(lines[0]).toMatch(/^> \[!quote\] Kutipan — /);
		expect(onlyQuotedOrBlank(body)).toBe(true);
		expect(calloutHeaders(body)).toHaveLength(1);
		// satu-satunya "](" tanpa escape adalah tautan sumber milik kita (ke https), tidak pernah ke javascript:
		expect(body).not.toMatch(/(^|[^\\])\]\((?!https?:)/);
	});
	it("q dan a jahat tidak bisa membuat callout lain", () => {
		const body = buildCaptureBody(D({ q: "Apa?\n[!danger] x", a: "[!note] jawab\n---\nstatus: mature" }));
		expect(onlyQuotedOrBlank(body)).toBe(true);
		expect(calloutHeaders(body)).toEqual(["> [!quote] Kutipan — Judul Halaman", "> [!trigger] Pertanyaan pemicu"]);
	});
	it("escapeBlockLine / escapeInline", () => {
		expect(escapeBlockLine("[!danger] x")).toBe("\\[!danger] x");
		expect(escapeBlockLine("  [!danger]")).toBe("  \\[!danger]");
		expect(escapeBlockLine("a [[b]] ![[c]]")).toBe("a \\[\\[b]] !\\[\\[c]]");
		expect(escapeBlockLine("<b>x</b>")).toBe("\\<b>x\\</b>");
		expect(escapeBlockLine("50%% off")).toBe("50%\\% off");
		expect(escapeInline("C# [tips] <b> `x` *y*")).toBe("C\\# \\[tips\\] \\<b\\> \\`x\\` \\*y\\*");
		expect(escapeInline("a\nb")).toBe("a b");
	});
	it("teks biasa tetap terbaca utuh (tidak di-escape berlebihan)", () => {
		const body = buildCaptureBody(D({ text: "Cache itu penyimpanan sementara. Harganya Rp 5.000, bukan 50%." }));
		expect(body).toContain("> Cache itu penyimpanan sementara. Harganya Rp 5.000, bukan 50%.");
	});
});

describe("captureFileBase: nama file aman (NF-C4/NF-C5)", () => {
	const D2 = (title: string, text = "teks") => D({ title, text });
	it("path traversal dan pemisah folder tidak lolos", () => {
		for (const t of ["../../etc/passwd", "..\\..\\Windows\\System32", "a/b\\c", "C:\\Windows\\x", "/abs/path"]) {
			const n = captureFileBase(D2(t), "2026-11-12");
			expect(n, t).not.toMatch(/[\\/:]/);
			expect(n.startsWith(".")).toBe(false);
			expect(n.length).toBeGreaterThan(0);
		}
		expect(captureFileBase(D2("../../etc/passwd"), "2026-11-12")).toBe("etc passwd");
	});
	it("karakter terlarang dibuang; maks 80; tidak diawali/diakhiri titik/spasi", () => {
		expect(captureFileBase(D2('a*b?c"d<e>f|g#h^i[j]k'), "2026-11-12")).toBe("a b c d e f g h i j k");
		expect(Array.from(captureFileBase(D2("x".repeat(300)), "2026-11-12"))).toHaveLength(80);
		expect(captureFileBase(D2("..judul.. "), "2026-11-12")).toBe("judul");
		expect(captureFileBase(D2("judul."), "2026-11-12")).toBe("judul");
	});
	it("nama khusus Windows diberi akhiran", () => {
		for (const n of ["CON", "nul", "COM1", "lpt9", "Aux"]) expect(captureFileBase(D2(n), "2026-11-12")).toBe(`${n}_`);
		expect(captureFileBase(D2("CONSOLE"), "2026-11-12")).toBe("CONSOLE");
	});
	it("tanpa judul: pakai baris pertama teks; kosong sama sekali: 'Benih <tanggal>'", () => {
		expect(captureFileBase(D({ title: "", text: "Baris pertama\nkedua" }), "2026-11-12")).toBe("Baris pertama");
		expect(captureFileBase(D({ title: "***", text: "///" }), "2026-11-12")).toBe("Benih 2026-11-12");
		expect(captureFileBase(D({ title: "", text: "..." }), "2026-11-12")).toBe("Benih 2026-11-12");
		expect(captureFileBase(D({ title: "/", text: "\\" }), "2026-11-12")).toBe("Benih 2026-11-12");
	});
	it("emoji dan Unicode tidak terpotong di tengah", () => {
		const n = captureFileBase(D2("😀".repeat(100)), "2026-11-12");
		expect(Array.from(n)).toHaveLength(80);
		expect(n).toBe("😀".repeat(80));
	});
});

describe("planCapture", () => {
	const settings = mergeSettings({});
	const plan = (p: CaptureParams, today = "2026-11-12") => planCapture(p, { settings, today, maxText: 2000 });
	it("menghasilkan benih ide dengan tinjau sesuai interval, asal=capture, sumber=url", () => {
		const r = plan({ ...base, url: "https://contoh.com/x", title: "Halaman", q: "Apa?", a: "Itu." });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.plan.patch).toEqual({
			tipe: "ide",
			status: "benih",
			dibuat: "2026-11-12",
			tinjau: "2026-11-19",
			gerbang: [],
			sumber: "https://contoh.com/x",
			asal: "capture",
		});
		expect(r.plan.base).toBe("Halaman");
	});
	it("tanpa url: tidak ada properti sumber", () => {
		const r = plan(base);
		expect(r.ok && "sumber" in r.plan.patch).toBe(false);
	});
	it("interval benih kustom dipakai", () => {
		const s = mergeSettings({ intervals: { benih: 3 } });
		const r = planCapture(base, { settings: s, today: "2026-11-12", maxText: 2000 });
		expect(r.ok && r.plan.patch.tinjau).toBe("2026-11-15");
	});
	it("menolak versi salah / tanpa teks", () => {
		expect(plan({ text: "x" })).toEqual({ ok: false, error: "bad-version" });
		expect(plan({ v: "1", text: " " })).toEqual({ ok: false, error: "no-text" });
	});
	it("patch hanya menyentuh nama properti Seedbed dan frontmatter tidak pernah dirangkai dari teks", () => {
		const evil = { v: "1", text: "---\nstatus: mature\n---", title: "x\nstatus: mature", url: "https://a.b/?x=1\nstatus: mature" };
		const r = plan(evil);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const fm: Record<string, unknown> = {};
		applyPatch(fm, r.plan.patch);
		expect(Object.keys(fm).every((k) => (Object.values(KEY) as string[]).includes(k))).toBe(true);
		expect(fm[KEY.status]).toBe("seed"); // bukan "mature"
		expect(fm[KEY.source]).not.toContain("\n");
		expect(Object.keys(fm)).toEqual([KEY.type, KEY.status, KEY.created, KEY.review, KEY.gates, KEY.source, KEY.origin]);
		expect(r.plan.body.includes("status: mature")).toBe(true); // hanya sebagai teks kutipan
		expect(onlyQuotedOrBlank(r.plan.body)).toBe(true);
	});
	it("catatan hasil tangkapan terbaca sebagai ide benih oleh parser", () => {
		const r = plan({ ...base, url: "https://contoh.com/x" });
		if (!r.ok) throw new Error("x");
		const fm: Record<string, unknown> = {};
		applyPatch(fm, r.plan.patch);
		const parsed = parseIdeaNote("Ide/x.md", "x", fm);
		expect(parsed.kind).toBe("idea");
		expect(parsed.kind === "idea" && parsed.idea).toMatchObject({ tipe: "ide", status: "benih", asal: "capture", tinjau: "2026-11-19" });
	});
	it("kasus besar: teks 100 ribu karakter tidak meledak dan tetap terpotong", () => {
		const r = plan({ ...base, text: "x ".repeat(50_000) });
		expect(r.ok && r.plan.data.truncated).toBe(true);
		expect(r.ok && r.plan.body.length).toBeLessThan(2300);
	});
});

describe("pengaturan capture", () => {
	it("default: konfirmasi AKTIF, buka-setelah MATI, batas 2000", () => {
		expect(DEFAULT_SETTINGS.capture).toEqual({ confirm: true, openAfter: false, maxChars: 2000 });
	});
	it("data.json rusak tidak bisa mematikan konfirmasi (hanya boolean false eksplisit)", () => {
		for (const bad of [{ confirm: "false" }, { confirm: 0 }, { confirm: null }, "x", 5, []]) {
			expect(mergeSettings({ capture: bad }).capture.confirm).toBe(true);
		}
		expect(mergeSettings({ capture: { confirm: false } }).capture.confirm).toBe(false);
	});
	it("maxChars dijepit 200..20000", () => {
		expect(mergeSettings({ capture: { maxChars: 1 } }).capture.maxChars).toBe(200);
		expect(mergeSettings({ capture: { maxChars: 10 ** 9 } }).capture.maxChars).toBe(20000);
		expect(mergeSettings({ capture: { maxChars: "abc" } }).capture.maxChars).toBe(2000);
	});
});

describe("uniqueBase (NF-C5: tidak pernah menimpa)", () => {
	it("tidak bentrok: nama apa adanya", () => {
		expect(uniqueBase("Ide A", ["Ide B.md", "Lain"])).toBe("Ide A");
		expect(uniqueBase("Ide A", [])).toBe("Ide A");
	});
	it("bentrok: tambah angka", () => {
		expect(uniqueBase("Ide A", ["Ide A.md"])).toBe("Ide A 2");
		expect(uniqueBase("Ide A", ["Ide A.md", "Ide A 2.md"])).toBe("Ide A 3");
		expect(uniqueBase("Ide A", ["Ide A", "Ide A 2", "Ide A 3"])).toBe("Ide A 4");
	});
	it("tanpa membedakan huruf besar/kecil (Windows/macOS)", () => {
		expect(uniqueBase("Cara Kerja Cache", ["Cara kerja cache.md"])).toBe("Cara Kerja Cache 2");
		expect(uniqueBase("cara kerja cache", ["CARA KERJA CACHE.MD"])).toBe("cara kerja cache 2");
		expect(uniqueBase("Ide", ["IDE 2.md", "ide.md"])).toBe("Ide 3");
	});
	it("akhiran .md hanya dibuang di ujung, folder dan nama lain tidak ikut", () => {
		expect(uniqueBase("a.md notes", ["a.md notes.md"])).toBe("a.md notes 2");
	});
});
