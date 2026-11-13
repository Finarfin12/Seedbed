import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const base = resolve(here, "../../..");
export const vault = process.env.SEEDBED_QA_VAULT || join(tmpdir(), "seedbed-qa-084", "vault");
export const profile = process.env.SEEDBED_QA_PROFILE || join(tmpdir(), "seedbed-qa-084", "profile");
export const PORT = 9445;
const EXE = join(process.env.LOCALAPPDATA, "Programs", "Obsidian", "Obsidian.exe");

export function launch() {
	const child = spawn(EXE, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" });
	child.unref();
	return child.pid;
}

export async function targets() {
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`http://127.0.0.1:${PORT}/json`);
			const j = await r.json();
			if (j.some((t) => t.type === "page")) return j;
		} catch {}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error("CDP not reachable");
}

export async function connect() {
	const ts = await targets();
	const page = ts.filter((t) => t.type === "page").find((t) => /index\.html|app:\/\/obsidian/.test(t.url)) ?? ts.find((t) => t.type === "page");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res, rej) => {
		ws.onopen = res;
		ws.onerror = rej;
	});
	let id = 0;
	const pending = new Map();
	const events = [];
	ws.onmessage = (m) => {
		const d = JSON.parse(m.data);
		if (d.id && pending.has(d.id)) {
			pending.get(d.id)(d);
			pending.delete(d.id);
		} else if (d.method) {
			events.push(d);
		}
	};
	const send = (method, params = {}, timeoutMs = 10000) =>
		new Promise((res, rej) => {
			const i = ++id;
			const timer = setTimeout(() => {
				pending.delete(i);
				rej(new Error(`Timeout waiting for CDP response to ${method} (id: ${i})`));
			}, timeoutMs);
			pending.set(i, (val) => {
				clearTimeout(timer);
				res(val);
			});
			ws.send(JSON.stringify({ id: i, method, params }));
		});
	const ev = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (r.result?.exceptionDetails) {
			throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
		}
		return r.result?.result?.value;
	};
	const shot = async (file) => {
		const r = await send("Page.captureScreenshot", { format: "png" });
		writeFileSync(file, Buffer.from(r.result.data, "base64"));
	};
	return { ev, shot, send, events, close: () => ws.close(), title: page.title, url: page.url };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
