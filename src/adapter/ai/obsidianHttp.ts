import { requestUrl } from "obsidian";
import type { HttpClient, HttpResponse } from "./http";

/** HttpClient memakai requestUrl Obsidian (menghindari masalah CORS). throw:false agar status non-2xx tidak melempar. */
export class ObsidianHttp implements HttpClient {
	async get(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse> {
		const r = await requestUrl({ url, method: "GET", headers: opts?.headers, throw: false });
		return { status: r.status, text: r.text };
	}

	async post(url: string, body: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse> {
		const r = await requestUrl({
			url,
			method: "POST",
			headers: opts?.headers,
			contentType: "application/json",
			body,
			throw: false,
		});
		return { status: r.status, text: r.text };
	}
}
