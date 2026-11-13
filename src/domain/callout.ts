/** Pembentuk callout Markdown (jejak berpikir). Hanya menghasilkan teks; penulisan oleh NoteWriter. */

export interface CalloutEntry {
	label: string;
	question: string;
	answer: string;
	/** Label sumber (R-6), mis. "AI · lokal (ollama)" atau "Bank". */
	source?: string;
	/** Catatan tambahan di baris label (mis. "ditandai keliru", "petunjuk ×1", "remembered"). */
	meta?: string[];
	/** Baris tambahan setelah jawaban, mis. { label: "Earlier answer", text: "..." } (retrieval). */
	extra?: Array<{ label: string; text: string }>;
}

export type CalloutType = "socratic" | "devil" | "premortem" | "connect" | "retrieval";

function quote(line: string): string {
	return line.length === 0 ? ">" : `> ${line}`;
}

/** Format v1: baris isi yang diawali "[!" ditulis "\[!" supaya tidak menjadi callout baru. */
export function escapeCalloutLine(line: string): string {
	return line.replace(/^(\s*)\[!/, "$1\\[!");
}

function textLines(text: string): string[] {
	return text
		.trim()
		.split(/\r?\n/)
		.map(escapeCalloutLine);
}

export function formatCallout(
	type: CalloutType,
	title: string,
	date: string,
	entries: CalloutEntry[],
	answerLabel: string,
): string {
	const lines: string[] = [`> [!${type}]- ${title} — ${date}`];
	entries.forEach((e, i) => {
		if (i > 0) lines.push(">");
		const tail = [e.source, ...(e.meta ?? [])].filter((x): x is string => !!x);
		lines.push(quote(`**${e.label}**${tail.map((x) => ` · ${x}`).join("")}`));
		for (const q of textLines(e.question)) lines.push(quote(q));
		textLines(e.answer).forEach((l, j) => lines.push(quote(j === 0 ? `${answerLabel}: ${l}` : l)));
		for (const x of e.extra ?? []) textLines(x.text).forEach((l, j) => lines.push(quote(j === 0 ? `${x.label}: ${l}` : l)));
	});
	return lines.join("\n");
}

/** Tambahkan blok di akhir teks tanpa mengubah teks asli (NF-6): hanya menambah. */
export function appendBlock(original: string, block: string): string {
	const sep = original.length === 0 ? "" : original.endsWith("\n\n") ? "" : original.endsWith("\n") ? "\n" : "\n\n";
	return `${original}${sep}${block}\n`;
}
