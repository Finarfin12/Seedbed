import bankEn from "./bank.en.json";
import bankId from "./bank.id.json";
import type { Lang } from "./markdown";

export const CATEGORIES = ["kaitan", "ragu", "pakai", "tanya", "lawan"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Bank = Record<Category, string[]>;
export const BANKS: Record<Lang, Bank> = { id: bankId as Bank, en: bankEn as Bank };

export interface Trigger {
	category: Category;
	text: string;
}

export type Rng = () => number;

function pickIndex(n: number, rng: Rng): number {
	return Math.min(n - 1, Math.max(0, Math.floor(rng() * n)));
}

/** Satu pertanyaan pemicu acak (kategori acak, lalu pertanyaan acak di kategori itu). */
export function pickTrigger(lang: Lang, rng: Rng = Math.random, banks: Record<Lang, Bank> = BANKS): Trigger {
	const bank = banks[lang] ?? banks.id;
	const category = CATEGORIES[pickIndex(CATEGORIES.length, rng)] as Category;
	const list = bank[category];
	return { category, text: list[pickIndex(list.length, rng)] as string };
}

/**
 * "Ganti pertanyaan": pilih pertanyaan LAIN (teks berbeda dari `current`), dan bila memungkinkan dari kategori lain.
 * Selalu mengembalikan pertanyaan berbeda selama bank punya lebih dari satu pertanyaan.
 */
export function nextTrigger(lang: Lang, current: Trigger | null, rng: Rng = Math.random, banks: Record<Lang, Bank> = BANKS): Trigger {
	const bank = banks[lang] ?? banks.id;
	const pool: Trigger[] = [];
	for (const category of CATEGORIES) for (const text of bank[category]) pool.push({ category, text });
	if (!current) return pool[pickIndex(pool.length, rng)] as Trigger;
	const otherCategory = pool.filter((t) => t.category !== current.category);
	const candidates = otherCategory.length > 0 ? otherCategory : pool.filter((t) => t.text !== current.text);
	if (candidates.length === 0) return current;
	return candidates[pickIndex(candidates.length, rng)] as Trigger;
}
