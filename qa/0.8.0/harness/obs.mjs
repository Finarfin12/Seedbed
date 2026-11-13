// Harness: instance Obsidian terpisah (profil sementara) yang hanya membuka vault QA. CDP via WebSocket bawaan Node.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const base = resolve(here, "../../..");
export const vault = join(base, "qa", "0.8.0", "_vault");
export const profile = join(base, "qa", "0.8.0", "_profile");
export const PORT = 9445;
const EXE = join(process.env.LOCALAPPDATA, "Programs", "Obsidian", "Obsidian.exe");

export function launch() {
  if (existsSync(profile)) rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  copyFileSync(join(process.env.APPDATA, "obsidian", "obsidian-1.15.0.asar"), join(profile, "obsidian-1.15.0.asar"));
  writeFileSync(join(profile, "obsidian.json"), JSON.stringify({ vaults: { qa080: { path: vault, ts: Date.now(), open: true } }, cli: false }));
  const child = spawn(EXE, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" });
  child.unref();
  return child.pid;
}

export async function targets() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json`); const j = await r.json(); if (j.some((t) => t.type === "page")) return j; } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("CDP not reachable");
}

export async function connect() {
  const ts = await targets();
  const page = ts.filter((t) => t.type === "page").find((t) => /index\.html|app:\/\/obsidian/.test(t.url)) ?? ts.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const shot = async (file) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
  };
  return { ev, shot, send, close: () => ws.close(), title: page.title, url: page.url };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function killProfile() {
  // Menutup HANYA proses Obsidian yang memakai profil QA (bukan instance utama).
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='Obsidian.exe'\\" | Where-Object { $_.CommandLine -like '*_profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { encoding: "utf8" });
    return out;
  } catch (e) { return String(e); }
}
