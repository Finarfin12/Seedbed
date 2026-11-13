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

  const P = "app.plugins.plugins.seedbed";
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
    read: (p) => c.ev(`app.vault.adapter.read(${JSON.stringify(p)})`),
    setSettings: (obj) => c.ev(`(async()=>{ const p=${P}; Object.assign(p.settings, ${JSON.stringify(obj)}); await p.saveSettings(); p.refreshViews(); })()`),
    patchSettings: (js) => c.ev(`(async()=>{ const p=${P}; const s=p.settings; ${js}; await p.saveSettings(); p.refreshViews(); })()`),
    openFile: (p) => c.ev(`(async()=>{ const f=app.vault.getFileByPath(${JSON.stringify(p)}); await app.workspace.getLeaf(false).openFile(f); })()`),
    cmd: (id) => c.ev(`app.commands.executeCommandById(${JSON.stringify("seedbed:" + id)})`),
    hasCmd: (id) => c.ev(`!!Object.values(app.commands.commands).find(x=>x.id===${JSON.stringify("seedbed:" + id)}) && app.commands.listCommands().some(x=>x.id===${JSON.stringify("seedbed:" + id)})`),
    async openIncubator() {
      await c.ev(`app.commands.executeCommandById('seedbed:open-incubator')`);
      await sleep(700);
    },
    items: () => c.ev(`JSON.stringify([...document.querySelectorAll('.bengkel-view li.bengkel-item')].map(li=>({title:li.querySelector('.bengkel-title')?.textContent, meta:li.querySelector('.bengkel-meta')?.textContent, section:li.closest('.bengkel-section')?.querySelector('h5,summary')?.textContent, buttons:[...li.querySelectorAll('button')].map(b=>b.getAttribute('aria-label'))})))`).then(JSON.parse),
    clickBtn: (title, label, nth = 0) => c.ev(`(()=>{ const lis=[...document.querySelectorAll('.bengkel-view li.bengkel-item')].filter(li=>li.querySelector('.bengkel-title')?.textContent===${JSON.stringify(title)}); const hits=lis.flatMap(li=>[...li.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')===${JSON.stringify(label)})); if(!hits[${nth}]) return false; hits[${nth}].click(); return true; })()`),
    notices: () => c.ev(`JSON.stringify([...document.querySelectorAll('.notice')].map(n=>n.textContent))`).then(JSON.parse),
    modalText: () => c.ev(`document.querySelector('.modal')?.innerText ?? null`),
    async fill(texts) {
      await c.ev(`(()=>{ const as=[...document.querySelectorAll('.modal textarea')]; const v=${JSON.stringify(texts)}; v.forEach((t,i)=>{ if(t==null||!as[i]) return; as[i].value=t; as[i].dispatchEvent(new Event('input',{bubbles:true})); }); })()`);
    },
    clickModal: (text) => c.ev(`(()=>{ const b=[...document.querySelectorAll('.modal button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if(!b||b.disabled) return false; b.click(); return true; })()`),
    shot: (id, title) => {
      mkdirSync(join(base, "qa", "0.8.3", "screenshots"), { recursive: true });
      return c.shot(join(base, "qa", "0.8.3", "screenshots", (id + " - " + title).replace(/[:\/*?\"<>|]/g, " -") + ".png"));
    },
    sourceView: (p) => c.ev(`(async()=>{ const f=app.vault.getFileByPath(${JSON.stringify(p)}); const l=app.workspace.getLeaf(false); await l.openFile(f); await l.setViewState({type:'markdown',state:{file:f.path,mode:'source',source:true}}); })()`)
  };
  return api;
}

export function fm(s) {
  const m = (s || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : "";
}

export function evidence(id, text) {
  writeFileSync(join(base, "qa", "0.8.3", `${id}.md`), text, "utf8");
}
