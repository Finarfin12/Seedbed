import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/domain/settings";
import { makeT } from "../src/i18n";
import { resolveVisible } from "../src/ui/settingDefinitions";
import { BengkelSettingTab } from "../src/ui/settingsTab";

const createMockPlugin = () => {
	const settings = structuredClone(DEFAULT_SETTINGS);
	return {
		app: {},
		settings,
		controller: {
			t: (key: string, vars?: Record<string, string | number>) => makeT(settings.language)(key as any, vars),
			safe: (fn: () => void) => fn(),
			createTemplates: vi.fn(),
		},
		aiStats: { cli: 0, local: 0, api: 0 },
		lastDetection: null,
		saveSettings: vi.fn().mockResolvedValue(undefined),
		rebuildQuestionService: vi.fn(),
		refreshViews: vi.fn(),
		loadQuestionBank: vi.fn().mockResolvedValue(undefined),
		rebuildIndex: vi.fn(),
		refreshTemplateFolder: vi.fn(),
		templates: { folder: vi.fn().mockResolvedValue("Templates") },
		detectAi: vi.fn().mockResolvedValue(undefined),
	} as any;
};

describe("BengkelSettingTab declarative settings", () => {
	it("T-S1.1: returns all 14 groups and each group has non-empty items", () => {
		const plugin = createMockPlugin();
		const tab = new BengkelSettingTab({} as any, plugin);
		const groups = tab.getSettingDefinitions();

		expect(groups).toHaveLength(14);
		const expectedGroupIds = [
			"general",
			"review",
			"gates",
			"premortem",
			"retrieval",
			"connect",
			"digest",
			"feynman",
			"bank",
			"props",
			"templates",
			"capture",
			"ai",
			"maintenance",
		];
		expect(groups.map((g) => g.id)).toEqual(expectedGroupIds);

		for (const g of groups) {
			expect(g.type).toBe("group");
			expect(g.heading).toBeTruthy();
			expect(g.items.length).toBeGreaterThan(0);
		}
	});

	it("T-S1.2: enforces uniqueness of group IDs and item IDs", () => {
		const plugin = createMockPlugin();
		const tab = new BengkelSettingTab({} as any, plugin);
		const groups = tab.getSettingDefinitions();

		const groupIds = new Set<string>();
		const itemIds = new Set<string>();

		for (const g of groups) {
			expect(groupIds.has(g.id)).toBe(false);
			groupIds.add(g.id);

			for (const item of g.items) {
				expect(itemIds.has(item.id)).toBe(false);
				itemIds.add(item.id);
			}
		}
	});

	it("T-S1.3: satisfies DEe(o) contract and searchable constraints", () => {
		const plugin = createMockPlugin();
		const tab = new BengkelSettingTab({} as any, plugin);
		const groups = tab.getSettingDefinitions();

		for (const g of groups) {
			for (const item of g.items) {
				// Each item must have a render function
				expect(typeof item.render).toBe("function");

				// Item without name must be marked searchable: false
				if (item.name === "") {
					expect(item.searchable).toBe(false);
				}
			}
		}
	});

	it("T-S1.4: respects visible flag dynamically for AI settings", () => {
		const plugin = createMockPlugin();
		plugin.settings.ai.enabled = false;
		const tab = new BengkelSettingTab({} as any, plugin);
		const groups = tab.getSettingDefinitions();
		const aiGroup = groups.find((g) => g.id === "ai");
		expect(aiGroup).toBeDefined();

		// When AI is disabled, sub-items should have resolveVisible === false
		const aiEnabledItem = aiGroup!.items.find((i) => i.id === "ai.enabled");
		const aiDetectItem = aiGroup!.items.find((i) => i.id === "ai.detect");
		const aiCliItem = aiGroup!.items.find((i) => i.id === "ai.cli.enable");

		expect(resolveVisible(aiEnabledItem?.visible)).toBe(true);
		expect(resolveVisible(aiDetectItem?.visible)).toBe(false);
		expect(resolveVisible(aiCliItem?.visible)).toBe(false);

		// Now enable AI
		plugin.settings.ai.enabled = true;
		expect(resolveVisible(aiDetectItem?.visible)).toBe(true);
		expect(resolveVisible(aiCliItem?.visible)).toBe(true);
	});

	it("T-S1.5: display() executes cleanly and redisplay() calls update() if present", () => {
		const plugin = createMockPlugin();
		const tab = new BengkelSettingTab({} as any, plugin);

		// display() runs without error
		expect(() => tab.display()).not.toThrow();

		// Test redisplay() fallback to display when update is absent
		const displaySpy = vi.spyOn(tab, "display");
		(tab as any).redisplay();
		expect(displaySpy).toHaveBeenCalled();

		// Test redisplay() calls update() when update is present (Obsidian 1.13+)
		const updateMock = vi.fn();
		(tab as any).update = updateMock;
		displaySpy.mockClear();

		(tab as any).redisplay();
		expect(updateMock).toHaveBeenCalled();
		expect(displaySpy).not.toHaveBeenCalled();
	});

	it("T-S1.6: updates language translations on getSettingDefinitions()", () => {
		const plugin = createMockPlugin();
		plugin.settings.language = "id";
		const tab = new BengkelSettingTab({} as any, plugin);

		const idGeneral = tab.getSettingDefinitions().find((g) => g.id === "general");
		expect(idGeneral?.heading).toBe("Umum");

		plugin.settings.language = "en";
		const enGeneral = tab.getSettingDefinitions().find((g) => g.id === "general");
		expect(enGeneral?.heading).toBe("General");
	});
});
