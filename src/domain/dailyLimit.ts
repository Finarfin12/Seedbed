/** Penahan tumpukan: hitungan benih per hari (tanggal LOKAL, reset tengah malam). Murni. */

export interface DailyState {
	/** YYYY-MM-DD lokal */
	date: string;
	count: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function localDate(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Cap waktu lokal HHmmss (untuk nama file unik di mode cadangan). */
export function localStamp(d: Date): string {
	return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Data dari storage tidak tepercaya: bentuk salah atau tanggal lain => hitungan 0 untuk hari ini. */
export function normalizeState(raw: unknown, today: string): DailyState {
	if (raw && typeof raw === "object") {
		const r = raw as Record<string, unknown>;
		if (r.date === today && typeof r.count === "number" && Number.isFinite(r.count) && r.count >= 0) {
			return { date: today, count: Math.floor(r.count) };
		}
	}
	return { date: today, count: 0 };
}

/** Melewati batas = sudah `limit` benih hari ini, sehingga yang berikutnya perlu konfirmasi. limit <= 0 = nonaktif. */
export function isOverLimit(state: DailyState, limit: number): boolean {
	return limit > 0 && state.count >= limit;
}

export function increment(state: DailyState, today: string): DailyState {
	const s = normalizeState(state, today);
	return { date: today, count: s.count + 1 };
}
