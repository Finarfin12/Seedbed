import type { DiscoveryResult } from "../adapter/ai/modelDiscovery";
import { isSafeModelName } from "../adapter/ai/cliSpecs";
import type { Key, TFn } from "../i18n";

/** Nilai khusus di dropdown (bukan nama model; isSafeModelName menolak keduanya). */
export const OTHER_VALUE = "__other__";

export interface PickerOption {
	value: string;
	label: string;
}

export interface PickerView {
	options: PickerOption[];
	/** Nilai yang terpilih di dropdown. */
	value: string;
	/** Tidak ada model terdeteksi: dropdown dinonaktifkan dan kolom manual selalu tampil. */
	disabled: boolean;
	/** Tampilkan kolom teks "model lain" (dipilih "Lainnya…" atau dropdown nonaktif). */
	showManual: boolean;
}

export interface PickerInput {
	result: DiscoveryResult | null | undefined;
	/** Model tersimpan di pengaturan (dipertahankan walau tidak ada di daftar terdeteksi). */
	saved: string;
	/** Boleh kosong = bawaan penyedia (CLI; LM Studio). */
	allowDefault: boolean;
	/** Pengguna memilih "Lainnya…". */
	manual: boolean;
	t: TFn;
}

/** Susun isi dropdown model dari hasil deteksi. Murni: tidak menyentuh DOM, jaringan, atau berkas. */
export function buildPicker(input: PickerInput): PickerView {
	const { result, saved, allowDefault, manual, t } = input;
	const models = result?.models ?? [];
	const labels = result?.labels ?? {};
	const options: PickerOption[] = [];

	if (models.length === 0) {
		const needsKey = result?.status === "needsKey";
		options.push({ value: "", label: t(needsKey ? "model.placeholder.needsKey" : "model.placeholder.none") });
		if (saved !== "") options.push({ value: saved, label: t("model.saved", { name: saved }) });
		return { options, value: saved !== "" ? saved : "", disabled: saved === "", showManual: true };
	}

	if (allowDefault) options.push({ value: "", label: t("model.default") });
	for (const id of models) options.push({ value: id, label: labels[id] ?? id });
	if (saved !== "" && !models.includes(saved)) options.push({ value: saved, label: t("model.saved", { name: saved }) });
	options.push({ value: OTHER_VALUE, label: t("model.other") });

	let value = manual ? OTHER_VALUE : saved;
	if (!options.some((o) => o.value === value)) value = allowDefault ? "" : (options[0]?.value ?? "");
	return { options, value, disabled: false, showManual: manual };
}

/** Teks status koneksi di bawah kolom model. */
export function statusText(result: DiscoveryResult | null | undefined, t: TFn): string {
	if (!result) return t("model.status.none");
	let base: string;
	switch (result.status) {
		case "ok":
			base = result.models.length > 0 ? t("model.status.ok", { n: result.models.length }) : t("model.status.ok0");
			break;
		case "desktopOnly":
			base = t("model.status.desktopOnly");
			break;
		case "needsKey":
			base = t("model.status.needsKey");
			break;
		case "unauthorized":
			base = t("model.status.unauthorized");
			break;
		case "error":
			base = result.detail ? `${t("model.status.error")} (${result.detail})` : t("model.status.error");
			break;
		default:
			base = t("model.status.unavailable");
	}
	return result.connected && result.detectOnly ? `${base} · ${t("model.status.detectOnly")}` : base;
}

/** Nama model manual: kosong atau lolos isSafeModelName (tidak boleh menyelundupkan flag). */
export function validateManualModel(value: string): { ok: true; model: string } | { ok: false } {
	const model = value.trim();
	return isSafeModelName(model) && model !== OTHER_VALUE ? { ok: true, model } : { ok: false };
}

export type { Key };
