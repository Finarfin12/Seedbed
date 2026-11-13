// Membuat catatan uji 0.8.0 di test-vault/Uji 0.8/ dan vault QA terpisah (qa/0.8.0/_vault). Tanpa menyentuh catatan lain.
import { cpSync, mkdirSync, rmSync, writeFileSync, utimesSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = new Date();
const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const T = iso(today), Y = iso(plus(-1)), F = iso(plus(30)), F14 = iso(plus(14));

const idea = (status, review, gates, created = iso(plus(-40))) =>
  `---\ntype: idea\nstatus: ${status}\ncreated: ${created}\nreview: ${review}\ngates: [${gates.join(", ")}]\n---\n`;
const soc = [
  ["Clarification", "What exactly do you mean?", "I mean a small weekly habit tracker for readers."],
  ["Assumptions", "What do you assume?", "I assume people already read at least once a week."],
  ["Evidence", "What evidence do you have?", "Three friends said they would use it every day."],
  ["Viewpoints", "Who would see this differently?", "Publishers might prefer sales numbers over habits."],
  ["Implications", "What follows if this is true?", "Then streaks matter more than the number of pages."],
  ["Question about the question", "Is this the right question?", "Maybe the real question is why people stop reading."],
];
const socCallout = (d) => `> [!socratic]- Socratic session — ${d}\n` + soc.map(([l, q, a]) => `> **${l}** · Bank\n> ${q}\n> Answer: ${a}`).join("\n>\n") + "\n";

const files = {
  "PM Matang.md": idea("mature", F, ["socratic", "devil"]) + "\nIdea body PM Matang.\n",
  "PM Growing.md": idea("growing", F14, ["socratic"]) + "\nIdea body PM Growing.\n",
  "PM Skill.md": idea("mature", F, ["socratic", "devil", "premortem"]) + "\nIdea body PM Skill.\n\n" +
    `> [!premortem]- Pre-mortem — ${Y}\n> **Premortem** · AI · skill (Claude Code)\n> Imagine it failed a year from now. What killed it?\n> Answer: Nobody kept the habit after the first month.\n`,
  "RT Jatuh tempo.md": idea("growing", Y, ["socratic"]) + "\nIdea body RT.\n\n" + socCallout(iso(plus(-10))),
  "RT Tanpa jejak.md": idea("seed", Y, []) + "\nNo thinking trail here.\n",
  "RT Skill.md": idea("growing", Y, ["socratic", "devil"]) + "\nIdea body RT Skill.\n\n" +
    `> [!devil]- Devil's Advocate session — ${iso(plus(-12))}\n> **Opponent** · AI · skill (Claude Code)\n> Who would oppose this, and why?\n> Answer: Bookshops, because it moves attention away from buying.\n\n` +
    `> [!retrieval]- Retrieval — ${iso(plus(-3))}\n> **Recall** · AI · skill (Claude Code)\n> Earlier you said something about who would oppose this. What was it?\n> Answer: The bookshops.\n> Earlier answer: Bookshops, because it moves attention away from buying.\n`,
  "DG Macet 31.md": idea("growing", F14, ["socratic"]) + "\nStuck 31 days.\n",
  "DG Macet 29.md": idea("growing", F14, ["socratic"]) + "\nStuck 29 days.\n",
  "CN Kopi.md": idea("seed", F14, []) + "\nKopi: idea tentang komunitas kopi dan kafe lokal untuk pembaca buku.\n",
  "CN Kafe.md": idea("seed", F14, []) + "\nKafe: kafe lokal sebagai tempat komunitas membaca kopi pagi.\n",
  "CN Kopi bukan Seedbed.md": "Catatan biasa tentang kopi dan kafe lokal, tanpa properti Seedbed. Rahasia: JANGAN-DIBACA-ATAU-DISEBUT.\n",
  "FY Konsep.md": `---\ntype: concept\nstatus: seed\ncreated: ${iso(plus(-5))}\nreview: ${F14}\ngates: []\n---\n\n` +
    "Entropy is entropy.\n\nLatency is an important thing.\n\nA database is a system that stores structured records so they can be queried.\n\nWe use the database and the entropy and the latency here.\n",
};
const mtimes = { "DG Macet 31.md": 31, "DG Macet 29.md": 29 };

const src = join(base, "test-vault", "Uji 0.8");
mkdirSync(src, { recursive: true });
for (const [n, c] of Object.entries(files)) writeFileSync(join(src, n), c);
for (const [n, days] of Object.entries(mtimes)) { const t = plus(-days); utimesSync(join(src, n), t, t); }

// Vault QA terpisah: hanya catatan uji + plugin build.
const vault = join(base, "qa", "0.8.0", "_vault");
if (existsSync(vault)) rmSync(vault, { recursive: true, force: true });
mkdirSync(join(vault, ".obsidian", "plugins", "seedbed"), { recursive: true });
cpSync(src, join(vault, "Uji 0.8"), { recursive: true, preserveTimestamps: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(base, f), join(vault, ".obsidian", "plugins", "seedbed", f));
writeFileSync(join(vault, ".obsidian", "community-plugins.json"), JSON.stringify(["seedbed"]));
writeFileSync(join(vault, ".obsidian", "app.json"), "{}");
writeFileSync(join(vault, ".obsidian", "plugins", "seedbed", "data.json"), JSON.stringify({ language: "en" }));
console.log("fixtures ok", { today: T, vault });
