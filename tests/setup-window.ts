import { vi } from "vitest";
vi.stubGlobal("window", globalThis);
if (!globalThis.requestAnimationFrame) {
	globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
}
