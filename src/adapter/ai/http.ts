/** Abstraksi HTTP (tanpa import obsidian) supaya penyedia bisa diuji dengan server tiruan lokal. */

export interface HttpResponse {
	status: number;
	text: string;
}

export interface HttpClient {
	get(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse>;
	post(url: string, body: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse>;
}

/** Gabungkan base URL dan path tanpa menggandakan "/". */
export function joinUrl(base: string, path: string): string {
	return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** localhost / 127.x / ::1 dianggap lokal (label "AI · lokal"), selain itu cloud. */
export function isLocalUrl(url: string): boolean {
	try {
		const h = new URL(url).hostname.toLowerCase();
		return h === "localhost" || h === "::1" || h === "[::1]" || /^127\./.test(h);
	} catch {
		return false;
	}
}
