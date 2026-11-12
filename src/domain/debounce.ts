/** Debounce kecil tanpa dependensi Obsidian; timer bisa diganti agar mudah diuji. */
export interface TimerApi<H = unknown> {
	set(fn: () => void, ms: number): H;
	clear(handle: H): void;
}

export interface Debounced {
	/** Jadwalkan ulang; panggilan beruntun digabung jadi satu. */
	(): void;
	cancel(): void;
	pending(): boolean;
}

const defaultTimers: TimerApi<ReturnType<typeof setTimeout>> = {
	set: (fn, ms) => setTimeout(fn, ms),
	clear: (h) => clearTimeout(h),
};

export function debounce<H = ReturnType<typeof setTimeout>>(fn: () => void, ms: number, timers?: TimerApi<H>): Debounced {
	const api = (timers ?? defaultTimers) as unknown as TimerApi<H>;
	let handle: H | null = null;
	const d = (() => {
		if (handle !== null) api.clear(handle);
		handle = api.set(() => {
			handle = null;
			fn();
		}, ms);
	}) as Debounced;
	d.cancel = () => {
		if (handle !== null) api.clear(handle);
		handle = null;
	};
	d.pending = () => handle !== null;
	return d;
}
