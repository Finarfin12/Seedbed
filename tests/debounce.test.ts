import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "../src/domain/debounce";

describe("debounce (dipakai refresh otomatis panel Celah)", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("menggabungkan banyak panggilan beruntun jadi satu eksekusi", () => {
		const fn = vi.fn();
		const d = debounce(fn, 400);
		for (let i = 0; i < 50; i++) {
			d();
			vi.advanceTimersByTime(100);
		}
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(400);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("berjalan lagi untuk rangkaian perubahan berikutnya", () => {
		const fn = vi.fn();
		const d = debounce(fn, 300);
		d();
		vi.advanceTimersByTime(300);
		d();
		vi.advanceTimersByTime(300);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("cancel membatalkan eksekusi yang tertunda", () => {
		const fn = vi.fn();
		const d = debounce(fn, 300);
		d();
		expect(d.pending()).toBe(true);
		d.cancel();
		expect(d.pending()).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(fn).not.toHaveBeenCalled();
	});
});
