// Fitur 0.8.0 (pre-mortem, retrieval, digest, connect). Murni: tanpa "obsidian", tanpa jaringan, tanpa proses.
import { addDays, daysBetween } from "./dates";
import { nextReview } from "./scheduler";
import type { Idea, Language, Settings, Status } from "./types";

// ---------------- Pre-mortem ----------------

export const PREMORTEM_CATEGORIES = ["pmCause", "pmSignal", "pmAssumption", "pmAffected", "pmPrevent"] as const;
export type PremortemCategory = (typeof PREMORTEM_CATEGORIES)[number];

export interface PmQuestion {
	category: PremortemCategory;
	text: string;
}

const PM_BANK: Record<Language, Record<PremortemCategory, string[]>> = {
	en: {
		pmCause: [
			"Imagine it is a year from now and this idea failed. What is the most likely cause?",
			"It failed a year from now. What went wrong that you did not see coming?",
			"A year later this idea is dead. What killed it?",
		],
		pmSignal: [
			"What warning signs would have shown up in the first month?",
			"Looking back, what early signal did you ignore?",
			"Which small thing going wrong first would tell you it is failing?",
		],
		pmAssumption: [
			"Which assumption behind this idea turned out to be false?",
			"What did you take for granted that was not true?",
			"Which belief, if wrong, breaks the whole idea?",
		],
		pmAffected: [
			"Who or what did you not take into account?",
			"Who was hurt or annoyed by this idea and pushed back?",
			"Which person or group could quietly block this?",
		],
		pmPrevent: [
			"What could you do now, today, to reduce the biggest of these risks?",
			"Which one cheap step now would make that failure less likely?",
			"What would you change in the plan after thinking about this?",
		],
	},
	id: {
		pmCause: [
			"Bayangkan setahun lagi ide ini gagal. Apa penyebab yang paling mungkin?",
			"Setahun lagi ide ini gagal. Apa yang salah dan tidak kamu duga?",
			"Setahun kemudian ide ini mati. Apa yang membunuhnya?",
		],
		pmSignal: [
			"Tanda peringatan apa yang akan muncul di bulan pertama?",
			"Kalau menengok ke belakang, sinyal awal apa yang kamu abaikan?",
			"Hal kecil apa yang pertama kali berjalan salah dan memberi tahu bahwa ini gagal?",
		],
		pmAssumption: [
			"Asumsi apa di balik ide ini yang ternyata salah?",
			"Apa yang kamu anggap benar begitu saja padahal tidak?",
			"Keyakinan mana yang, kalau salah, meruntuhkan seluruh ide ini?",
		],
		pmAffected: [
			"Siapa atau apa yang tidak kamu perhitungkan?",
			"Siapa yang dirugikan atau terganggu oleh ide ini lalu menolaknya?",
			"Orang atau kelompok mana yang diam-diam bisa menghalangi ini?",
		],
		pmPrevent: [
			"Apa yang bisa kamu lakukan sekarang untuk mengurangi risiko terbesar tadi?",
			"Satu langkah murah apa yang membuat kegagalan itu lebih kecil kemungkinannya?",
			"Apa yang akan kamu ubah dari rencana setelah memikirkan ini?",
		],
	},
};

/** 5 pertanyaan pre-mortem dari bank statis (satu per kategori; `pick` mengembalikan 0..1 untuk variasi). */
export function premortemQuestions(lang: Language, pick: () => number = Math.random): PmQuestion[] {
	return PREMORTEM_CATEGORIES.map((category) => {
		const list = PM_BANK[lang][category];
		return { category, text: list[Math.min(list.length - 1, Math.floor(pick() * list.length))] as string };
	});
}

export function premortemBankSize(lang: Language): number[] {
	return PREMORTEM_CATEGORIES.map((c) => PM_BANK[lang][c].length);
}

/** Aturan pasti: minimal `minAnswered` jawaban dengan panjang (trim) minimal `minChars`. */
export function premortemPassed(answers: string[], minAnswered: number, minChars: number): { passed: boolean; done: number } {
	const done = answers.filter((a) => a.trim().length >= minChars).length;
	return { passed: done >= minAnswered, done };
}

// ---------------- Retrieval ----------------

export interface QaPair {
	callout: string;
	label: string;
	question: string;
	answer: string;
}

const RECALL_SOURCES = ["socratic", "devil", "feynman-hint", "premortem"];

/** Ambil pasangan pertanyaan-jawaban dari callout jejak berpikir. Isi catatan = data. Tidak pernah melempar. */
export function parseQaPairs(text: string): QaPair[] {
	const out: QaPair[] = [];
	const lines = text.split(/\r?\n/);
	let callout = "";
	let cur: { label: string; q: string[]; a: string[]; inAnswer: boolean } | null = null;
	const flush = () => {
		if (cur && cur.a.length > 0) {
			out.push({ callout, label: cur.label, question: cur.q.join(" ").trim(), answer: cur.a.join("\n").trim() });
		}
		cur = null;
	};
	for (const raw of lines) {
		const m = /^>\s?(.*)$/.exec(raw);
		if (!m) {
			flush();
			callout = "";
			continue;
		}
		const body = m[1] as string;
		const head = /^\[!([\w-]+)\][+-]?/.exec(body);
		if (head) {
			flush();
			callout = (head[1] as string).toLowerCase();
			continue;
		}
		if (!RECALL_SOURCES.includes(callout)) continue;
		const label = /^\*\*(.+?)\*\*/.exec(body);
		if (label) {
			flush();
			cur = { label: label[1] as string, q: [], a: [], inAnswer: false };
			continue;
		}
		if (body.trim() === "") {
			flush();
			continue;
		}
		if (!cur) continue;
		const unesc = (x: string) => x.replace(/^(\s*)\\\[!/, "$1[!");
		const ans = /^(Answer|Jawaban):\s?(.*)$/.exec(body);
		if (ans) {
			cur.inAnswer = true;
			cur.a.push(unesc(ans[2] as string));
		} else if (cur.inAnswer) cur.a.push(unesc(body));
		else cur.q.push(body);
	}
	flush();
	return out.filter((p) => p.question.length > 0 && p.answer.trim().length >= 10);
}

/** Pilih sampai `n` pasangan berbeda (pertanyaan berbeda). */
export function pickRecall(pairs: QaPair[], n: number, pick: () => number = Math.random): QaPair[] {
	const pool = [...pairs];
	const out: QaPair[] = [];
	while (out.length < n && pool.length > 0) {
		const i = Math.min(pool.length - 1, Math.floor(pick() * pool.length));
		const [p] = pool.splice(i, 1);
		if (p && !out.some((o) => o.question === p.question)) out.push(p);
	}
	return out;
}

/**
 * Sesi retrieval (RT-2). Jawaban lama disimpan privat di sini dan HANYA keluar lewat submit() setelah ada jawaban baru.
 * Modal hanya memegang `questions()` (tanpa jawaban lama).
 */
export class RecallSession {
	private old: string[];
	private given: Array<string | null>;
	constructor(private pairs: QaPair[]) {
		this.old = pairs.map((p) => p.answer);
		this.given = pairs.map(() => null);
	}
	questions(): Array<{ label: string; question: string; callout: string }> {
		return this.pairs.map((p) => ({ label: p.label, question: p.question, callout: p.callout }));
	}
	/** Mengembalikan jawaban lama hanya bila jawaban baru tidak kosong; selain itu null. Satu kali per pertanyaan. */
	submit(i: number, answer: string): string | null {
		if (i < 0 || i >= this.old.length || answer.trim().length === 0) return null;
		if (this.given[i] === null) this.given[i] = answer.trim();
		return this.old[i] as string;
	}
	answered(): Array<{ index: number; pair: QaPair; answer: string }> {
		const out: Array<{ index: number; pair: QaPair; answer: string }> = [];
		this.given.forEach((g, index) => {
			if (g !== null) out.push({ index, pair: this.pairs[index] as QaPair, answer: g });
		});
		return out;
	}
}

export type SelfRating = "remembered" | "partly" | "forgot";

/** Interval tinjau berikutnya menurut penilaian sendiri: Lupa = interval ÷ 2, Ingat = × 1,5, Sebagian = tetap (min. 1 hari). */
export function retrievalReview(status: Status, rating: SelfRating | undefined, today: string, s: Settings): string | null {
	const base = nextReview(status, today, s);
	if (base === null) return null;
	if (!rating || rating === "partly" || !s.retrieval.adjustInterval) return base;
	const days = s.intervals[status === "dibuang" ? "benih" : status];
	const adj = rating === "forgot" ? Math.max(1, Math.round(days / 2)) : Math.max(1, Math.round(days * 1.5));
	return addDays(today, adj);
}

// ---------------- Digest ----------------

export interface DigestInput {
	ideas: Idea[];
	today: string;
	stuckDays: number;
	/** Gerbang lolos minggu ini: { title, gate } dari tanggal callout. */
	gatesThisWeek: Array<{ title: string; gate: string }>;
	lang: Language;
}

export function isStuck(i: Idea, today: string, stuckDays: number): boolean {
	if (i.status === "dibuang" || !i.tersentuh) return false;
	return daysBetween(i.tersentuh, today) > stuckDays;
}

export interface Suggestion {
	idea: Idea;
	reasonKey: "stuck-no-socratic" | "stuck" | "due";
	days: number;
}

/** Tanpa AI: ide macet paling lama; jika tidak ada, jatuh tempo paling lama. Alasan berbasis aturan. */
export function suggest(ideas: Idea[], today: string, stuckDays: number): Suggestion | null {
	const stuck = ideas
		.filter((i) => isStuck(i, today, stuckDays))
		.sort((a, b) => (a.tersentuh ?? "").localeCompare(b.tersentuh ?? "") || a.title.localeCompare(b.title));
	const s = stuck[0];
	if (s) {
		const days = daysBetween(s.tersentuh as string, today);
		return { idea: s, reasonKey: s.gerbang.includes("socratic") ? "stuck" : "stuck-no-socratic", days };
	}
	const due = ideas
		.filter((i) => i.status !== "dibuang" && (!i.tinjau || i.tinjau <= today))
		.sort((a, b) => (a.tinjau ?? "").localeCompare(b.tinjau ?? "") || a.title.localeCompare(b.title))[0];
	return due ? { idea: due, reasonKey: "due", days: due.tinjau ? daysBetween(due.tinjau, today) : 0 } : null;
}

const L = {
	en: {
		title: "Seedbed digest",
		due: "Due now",
		stuck: "Stuck",
		counts: "Per status",
		week: "This week",
		none: "none",
		newSeeds: "New seeds",
		gates: "Gates passed",
		suggest: "Suggested to test",
		stuckNoSoc: (d: number) => `not edited for ${d} days and the Socratic gate is not passed yet`,
		stuckR: (d: number) => `not edited for ${d} days`,
		dueR: (d: number) => (d > 0 ? `review was due ${d} days ago` : "review is due"),
		status: { benih: "seed", tumbuh: "growing", matang: "mature", dibuang: "discarded" } as Record<Status, string>,
	},
	id: {
		title: "Digest Seedbed",
		due: "Jatuh tempo",
		stuck: "Macet",
		counts: "Per status",
		week: "Minggu ini",
		none: "tidak ada",
		newSeeds: "Benih baru",
		gates: "Gerbang lolos",
		suggest: "Disarankan diuji",
		stuckNoSoc: (d: number) => `tidak diedit ${d} hari dan gerbang Socratic belum lolos`,
		stuckR: (d: number) => `tidak diedit ${d} hari`,
		dueR: (d: number) => (d > 0 ? `tinjau jatuh tempo ${d} hari lalu` : "tinjau jatuh tempo"),
		status: { benih: "benih", tumbuh: "tumbuh", matang: "matang", dibuang: "dibuang" } as Record<Status, string>,
	},
};

/** Isi catatan digest (Markdown biasa tanpa `type`, jadi bukan catatan Seedbed). Hanya fakta dari properti; tidak menilai ide. */
export function buildDigest(inp: DigestInput): string {
	const t = L[inp.lang];
	const link = (i: Idea) => `[[${i.title}]]`;
	const due = inp.ideas
		.filter((i) => i.status !== "dibuang" && (!i.tinjau || i.tinjau <= inp.today))
		.sort((a, b) => (a.tinjau ?? "").localeCompare(b.tinjau ?? "") || a.title.localeCompare(b.title));
	const stuck = inp.ideas
		.filter((i) => isStuck(i, inp.today, inp.stuckDays))
		.sort((a, b) => (a.tersentuh ?? "").localeCompare(b.tersentuh ?? ""));
	const count = (s: Status) => inp.ideas.filter((i) => i.status === s).length;
	const seeds = inp.ideas.filter((i) => i.dibuat && daysBetween(i.dibuat, inp.today) <= 7 && daysBetween(i.dibuat, inp.today) >= 0);
	const sug = suggest(inp.ideas, inp.today, inp.stuckDays);
	const reason = sug ? (sug.reasonKey === "stuck-no-socratic" ? t.stuckNoSoc(sug.days) : sug.reasonKey === "stuck" ? t.stuckR(sug.days) : t.dueR(sug.days)) : "";
	const lines: string[] = [`# ${t.title} ${inp.today}`, "", `## ${t.due} (${due.length})`];
	lines.push(...(due.length ? due.map((i) => `- ${link(i)} (${t.status[i.status]}, ${i.tinjau ?? "-"})`) : [`- ${t.none}`]));
	lines.push("", `## ${t.stuck} (${stuck.length})`);
	lines.push(...(stuck.length ? stuck.map((i) => `- ${link(i)} (${t.status[i.status]}, ${i.tersentuh})`) : [`- ${t.none}`]));
	lines.push("", `## ${t.counts}`, `- ${t.status.benih}: ${count("benih")}`, `- ${t.status.tumbuh}: ${count("tumbuh")}`, `- ${t.status.matang}: ${count("matang")}`, `- ${t.status.dibuang}: ${count("dibuang")}`);
	lines.push("", `## ${t.week}`, `- ${t.newSeeds}: ${seeds.length ? seeds.map(link).join(", ") : t.none}`);
	lines.push(`- ${t.gates}: ${inp.gatesThisWeek.length ? inp.gatesThisWeek.map((g) => `[[${g.title}]] (${g.gate})`).join(", ") : t.none}`);
	lines.push("", `## ${t.suggest}`, sug ? `- ${link(sug.idea)}: ${reason}.` : `- ${t.none}`, "");
	return lines.join("\n");
}

/** Tanggal callout "— YYYY-MM-DD" dalam 7 hari terakhir: gerbang yang lolos minggu ini (berdasarkan jenis callout). */
export function gatesFromText(text: string, today: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(/^>\s*\[!(socratic|devil|feynman-hint|premortem)\][+-]?\s.*?—\s*(\d{4}-\d{2}-\d{2})/gm)) {
		const d = m[2] as string;
		const diff = daysBetween(d, today);
		if (diff >= 0 && diff <= 7) out.push(m[1] === "feynman-hint" ? "feynman" : (m[1] as string));
	}
	return [...new Set(out)];
}

// ---------------- Connect ----------------

const STOP = new Set(
	"the a an and or of to in on for with is are was be it this that as at by from not no yes i you we they my your our their yang dan di ke dari untuk dengan adalah itu ini atau pada saya kamu kita mereka tidak ada akan bisa juga".split(" "),
);

function tokens(s: string): Set<string> {
	const out = new Set<string>();
	for (const m of s.toLowerCase().matchAll(/[\p{L}\p{N}]{3,}/gu)) if (!STOP.has(m[0])) out.add(m[0]);
	return out;
}

export interface ConnectNote {
	path: string;
	title: string;
	text: string;
}

/** Isi catatan tanpa frontmatter dan tanpa penanda callout, supaya kata seperti "type"/"status"/"socratic" tidak dianggap kesamaan. */
export function bodyOf(text: string): string {
	return text
		.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "")
		.replace(/^>\s*\[![\w-]+\][+-]?.*$/gm, "")
		.replace(/^>\s*\*\*[^*]+\*\*.*$/gm, "")
		.replace(/^>\s*(Answer|Jawaban|Earlier answer|Jawaban lama):\s?/gm, "> ");
}

/** Kandidat = catatan Seedbed lain (pemanggil hanya memberi catatan Seedbed), maks. `max`, berdasarkan kata bersama pada judul + awal isi. Tanpa AI. */
export function rankCandidates(target: ConnectNote, others: ConnectNote[], max = 10): Array<{ note: ConnectNote; score: number }> {
	const tk = tokens(`${target.title} ${target.title} ${bodyOf(target.text).slice(0, 1500)}`);
	const scored = others
		.filter((o) => o.path !== target.path)
		.map((o) => {
			const ok = tokens(`${o.title} ${o.title} ${bodyOf(o.text).slice(0, 600)}`);
			let score = 0;
			for (const w of ok) if (tk.has(w)) score++;
			return { note: o, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title));
	return scored.slice(0, max);
}

export function connectQuestion(lang: Language, title: string): string {
	return lang === "id"
		? `Apakah ide ini mendukung, bertentangan dengan, atau berkaitan dengan "${title}"? Jelaskan dengan kata-katamu.`
		: `Does this idea support, contradict, or relate to "${title}"? Explain in your own words.`;
}

/** Baris tautan yang ditambahkan di akhir catatan hanya setelah pengguna mengklik. Judul dibersihkan dari karakter tautan. */
export function relatedLine(title: string): string {
	return `Related: [[${title.replace(/[\[\]|#^\\\n\r]/g, " ").replace(/\s+/g, " ").trim()}]]`;
}
