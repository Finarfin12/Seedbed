import { describe, expect, it } from "vitest";
import { ApiProvider, LocalHttpProvider } from "../src/adapter/ai/providers";
import type { HttpClient } from "../src/adapter/ai/http";
import { DEFAULT_AI } from "../src/domain/ai/types";
import { ProviderChain } from "../src/domain/ai/chain";

const prompt = { system: "s", user: "u" };
const response = { status: 200, text: "{}" };
const exposed = (e: Error) => Object.getOwnPropertyNames(e).map(k => String((e as unknown as Record<string, unknown>)[k])).join(" ");

describe("transport error boundary", () => {
  it.each(["xy", "dummy-key-123"])('redacts configured key %s and discards error metadata', async key => {
    const original = Object.assign(new Error(`failed ${key} ${key}`), { cause: { key }, headers: { authorization: key }, config: { key }, extra: key });
    original.stack = `stack ${key}`;
    const http: HttpClient = { get: async () => response, post: async () => { throw original; } };
    const cfg = { ...DEFAULT_AI.providers.api, baseUrl: "https://example.invalid", model: "m", apiKey: key };
    const provider = new ApiProvider(cfg, http);
    let caught: unknown;
    try { await provider.complete(prompt); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error); expect(caught).not.toBe(original);
    expect(exposed(caught as Error)).not.toContain(key);
    expect(Object.getOwnPropertyNames(caught)).toEqual(expect.arrayContaining(["message", "stack"]));
    expect((caught as Error & { cause?: unknown }).cause).toBeUndefined();
    const logs: unknown[] = [];
    const result = await new ProviderChain([provider], 1000, [key], a => logs.push(a)).run(prompt, x => x);
    expect(result.value).toBeNull(); expect(JSON.stringify([result.attempts, logs])).not.toContain(key);
  });
  it.each(["short secret", { token: "hidden" }])("handles non-Error thrown value", async value => {
    const http: HttpClient = { get: async () => response, post: async () => { throw value; } };
    const provider = new ApiProvider({ ...DEFAULT_AI.providers.api, baseUrl: "https://example.invalid", model: "m", apiKey: "" }, http);
    try { await provider.complete(prompt); throw new Error("did not throw"); } catch (e) { expect(e).toBeInstanceOf(Error); expect(e).not.toBe(value); expect((e as Error & { cause?: unknown }).cause).toBeUndefined(); }
  });
  it("does not expose transport text that starts with the provider name", async () => {
    const http: HttpClient = { get: async () => { throw new Error("ollama private secret"); }, post: async () => response };
    const p = new LocalHttpProvider({ ...DEFAULT_AI.providers.local, kind: "ollama", model: "m" }, http);
    await expect(p.complete(prompt)).rejects.toThrow(/^ollama not reachable$/);
  });
  it("keeps controlled status and timeout messages", async () => {
    const settings = { ...DEFAULT_AI.providers.local, kind: "ollama" as const, model: "m" };
    const status: HttpClient = { get: async () => ({ status: 503, text: "" }), post: async () => response };
    await expect(new LocalHttpProvider(settings, status).complete(prompt)).rejects.toThrow("ollama HTTP 503");
    const hang: HttpClient = { get: async () => new Promise(() => {}), post: async () => response };
    await expect(new LocalHttpProvider(settings, hang, 10).complete(prompt)).rejects.toThrow("no answer in 10ms");
  });
});
