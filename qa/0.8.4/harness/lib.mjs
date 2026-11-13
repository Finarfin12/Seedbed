import { connect, sleep, vault, PORT, base } from "./obs.mjs";
import { copyFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export { sleep };

export async function session() {
	const c = await connect();
	await c.ev(`(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>/Trust author/i.test(b.textContent)); if(b) b.click(); })()`);
	await sleep(1500);
	try {
		const ts = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
		for (const t of ts) if (t.type === "page" && t.url !== c.url) await fetch(`http://127.0.0.1:${PORT}/json/close/` + t.id);
	} catch {}
	await sleep(500);

	const api = {
		c,
		ev: c.ev,
		async reloadPlugin() {
			for (const f of ["main.js", "manifest.json", "styles.css"]) {
				copyFileSync(join(base, f), join(vault, ".obsidian", "plugins", "seedbed", f));
			}
			await c.ev(`(async()=>{ await app.plugins.disablePlugin('seedbed'); await app.plugins.enablePlugin('seedbed'); })()`);
			await sleep(1000);
		},
		shot: (id, title) => {
			mkdirSync(join(base, "qa", "0.8.4", "screenshots"), { recursive: true });
			return c.shot(join(base, "qa", "0.8.4", "screenshots", (id + " - " + title).replace(/[:\/*?\"<>|]/g, " -") + ".png"));
		},
	};
	return api;
}

export function evidence(id, text) {
	writeFileSync(join(base, "qa", "0.8.4", `${id}.md`), text, "utf8");
}
