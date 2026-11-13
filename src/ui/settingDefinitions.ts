import type { Setting } from "obsidian";

export interface SettingItemDef {
	id: string;
	name: string;
	desc?: string;
	cls?: string;
	searchable?: boolean;
	keywords?: string[];
	visible?: boolean | (() => boolean);
	render: (setting: Setting) => void;
}

export interface SettingGroupDef {
	type: "group";
	id: string;
	heading?: string;
	cls?: string;
	visible?: boolean | (() => boolean);
	items: SettingItemDef[];
}

export function resolveVisible(v: boolean | (() => boolean) | undefined): boolean {
	if (v === undefined) return true;
	return typeof v === "function" ? v() : v;
}

export function hasUpdateMethod(tab: unknown): tab is { update: () => void } {
	return (
		typeof tab === "object" &&
		tab !== null &&
		"update" in tab &&
		typeof (tab as { update?: unknown }).update === "function"
	);
}
