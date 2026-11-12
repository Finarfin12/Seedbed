/** Pembentuk callout Markdown (jejak berpikir). Hanya menghasilkan teks; penulisan oleh NoteWriter. */

export interface CalloutEntry {
	label: string;
	question: string;
	answer: string;
	/** Label sumber (R-6), mis. "AI · lokal (ollama)" atau "Bank". */
	source?: string;
	/** Catatan tambahan di baris label (mis. "ditandai keliru", "petunjuk ×1"). */
	meta?: string[];
}

export type CalloutType = "socratic" | "devil";

function quote(line: string): string {
	return line.length === 0 ? ">" : `> ${line}`;
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
		lines.push(quote(e.question));
		const answerLines = e.answer.trim().split(/\r?\n/);
		answerLines.forEach((l, j) => lines.push(quote(j === 0 ? `${answerLabel}: ${l}` : l)));
	});
	return lines.join("\n");
}

/** Tambahkan blok di akhir teks tanpa mengubah teks asli (NF-6): hanya menambah. */
export function appendBlock(original: string, block: string): string {
	const sep = original.length === 0 ? "" : original.endsWith("\n\n") ? "" : original.endsWith("\n") ? "\n" : "\n\n";
	return `${original}${sep}${block}\n`;
}
