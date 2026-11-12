import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { HttpClient, HttpResponse } from "../../src/adapter/ai/http";
import type { ProcessRunner, RunOptions, RunResult } from "../../src/adapter/ai/runner";

/** HttpClient berbasis fetch Node (hanya untuk tes; menjangkau server tiruan lokal). */
export class NodeFetchHttp implements HttpClient {
	calls: Array<{ method: string; url: string; body?: string; headers?: Record<string, string> }> = [];

	async get(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse> {
		this.calls.push({ method: "GET", url, headers: opts?.headers });
		const r = await fetch(url, { headers: opts?.headers });
		return { status: r.status, text: await r.text() };
	}

	async post(url: string, body: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse> {
		this.calls.push({ method: "POST", url, body, headers: opts?.headers });
		const r = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
		return { status: r.status, text: await r.text() };
	}
}

/** HttpClient/ProcessRunner penghitung: harus 0 panggilan saat AI mati. */
export class CountingHttp implements HttpClient {
	count = 0;
	async get(): Promise<HttpResponse> {
		this.count++;
		return { status: 200, text: "{}" };
	}
	async post(): Promise<HttpResponse> {
		this.count++;
		return { status: 200, text: "{}" };
	}
}

export class CountingRunner implements ProcessRunner {
	count = 0;
	calls: Array<{ file: string; args: string[]; opts: RunOptions }> = [];
	constructor(private result: RunResult = { code: 0, stdout: "", stderr: "" }) {}
	async run(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
		this.count++;
		this.calls.push({ file, args, opts });
		return this.result;
	}
}

export interface MockServer {
	url: string;
	requests: Array<{ method: string; url: string; headers: IncomingMessage["headers"]; body: string }>;
	setHandler(h: (req: { method: string; url: string; body: string }) => { status?: number; body: string; delayMs?: number }): void;
	close(): Promise<void>;
}

/** Server HTTP lokal tiruan (Ollama / LM Studio / API OpenAI-kompatibel). */
export async function startMockServer(): Promise<MockServer> {
	let handler: Parameters<MockServer["setHandler"]>[0] = () => ({ body: "{}" });
	const requests: MockServer["requests"] = [];
	const server: Server = createServer((req, res) => {
		let body = "";
		req.on("data", (d) => (body += d));
		req.on("end", () => {
			const info = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body };
			requests.push(info);
			const out = handler({ method: info.method, url: info.url, body });
			const send = () => {
				res.statusCode = out.status ?? 200;
				res.setHeader("Content-Type", "application/json");
				res.end(out.body);
			};
			if (out.delayMs) setTimeout(send, out.delayMs);
			else send();
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const port = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		setHandler: (h) => {
			handler = h;
		},
		close: () =>
			new Promise<void>((r) => {
				server.closeAllConnections?.();
				server.close(() => r());
			}),
	};
}
