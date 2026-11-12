import type { Language } from "../domain/types";
import { en } from "./en";
import { id } from "./id";
import type { Key } from "./id";

export type { Key };
export type TFn = (key: Key, vars?: Record<string, string | number>) => string;

const TABLES: Record<Language, Record<Key, string>> = { id, en };

/** Ganti {nama} dengan nilainya. Variabel yang tidak ada dibiarkan apa adanya. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function makeT(language: Language): TFn {
	const table = TABLES[language] ?? id;
	return (key, vars) => interpolate(table[key] ?? id[key], vars);
}
