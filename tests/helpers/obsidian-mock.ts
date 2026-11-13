export class MockElement {
	children: MockElement[] = [];
	textContent = "";
	className = "";
	classList = {
		add: (c: string) => {
			this.className += " " + c;
		},
		remove: () => {},
		contains: (c: string) => this.className.includes(c),
	};
	value = "";
	placeholder = "";
	type = "";
	min = "";
	max = "";
	checked = false;
	disabled = false;
	rows = 0;
	scrollTop = 0;
	listeners: Record<string, Function[]> = {};

	appendChild(child: MockElement) {
		this.children.push(child);
		return child;
	}
	append(...children: MockElement[]) {
		this.children.push(...children);
	}
	addEventListener(event: string, fn: Function) {
		(this.listeners[event] = this.listeners[event] || []).push(fn);
	}
	dispatchEvent(event: { type: string }) {
		for (const fn of this.listeners[event.type] || []) fn(event);
	}
	empty() {
		this.children = [];
		this.textContent = "";
	}
	createEl(_tag: string, opts?: { text?: string; cls?: string }) {
		const el = new MockElement();
		if (opts?.text) el.textContent = opts.text;
		if (opts?.cls) el.className = opts.cls;
		this.children.push(el);
		return el;
	}
	addClass(c: string) {
		this.className += " " + c;
	}
}

export class PluginSettingTab {
	app: any;
	plugin: any;
	containerEl: any;
	constructor(app: any, plugin: any) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = new MockElement();
	}
	display() {}
	hide() {}
}

export class Setting {
	settingEl = new MockElement();
	infoEl = new MockElement();
	nameEl = new MockElement();
	descEl = new MockElement();
	controlEl = new MockElement();
	constructor(public containerEl: any) {
		this.settingEl.append(this.infoEl, this.controlEl);
		this.infoEl.append(this.nameEl, this.descEl);
		containerEl?.appendChild(this.settingEl);
	}
	setName(name: string) {
		this.nameEl.textContent = name;
		return this;
	}
	setDesc(desc: string) {
		this.descEl.textContent = desc;
		return this;
	}
	setHeading() {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}
	addText(cb: (t: any) => any) {
		const inputEl = new MockElement();
		const comp = {
			inputEl,
			setValue: (v: string) => {
				inputEl.value = v;
				return comp;
			},
			setPlaceholder: (p: string) => {
				inputEl.placeholder = p;
				return comp;
			},
			onChange: (handler: (v: string) => void) => {
				inputEl.addEventListener("input", () => handler(inputEl.value));
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(inputEl);
		return this;
	}
	addToggle(cb: (t: any) => any) {
		const toggleEl = new MockElement();
		const comp = {
			toggleEl,
			setValue: (v: boolean) => {
				toggleEl.checked = v;
				return comp;
			},
			onChange: (handler: (v: boolean) => void) => {
				toggleEl.addEventListener("change", () => handler(toggleEl.checked));
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(toggleEl);
		return this;
	}
	addDropdown(cb: (d: any) => any) {
		const selectEl = new MockElement();
		const comp = {
			selectEl,
			addOption: (val: string, label: string) => {
				const opt = new MockElement();
				opt.value = val;
				opt.textContent = label;
				selectEl.appendChild(opt);
				return comp;
			},
			setValue: (v: string) => {
				selectEl.value = v;
				return comp;
			},
			onChange: (handler: (v: string) => void) => {
				selectEl.addEventListener("change", () => handler(selectEl.value));
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(selectEl);
		return this;
	}
	addButton(cb: (b: any) => any) {
		const buttonEl = new MockElement();
		const comp = {
			buttonEl,
			setButtonText: (t: string) => {
				buttonEl.textContent = t;
				return comp;
			},
			setDisabled: (d: boolean) => {
				buttonEl.disabled = d;
				return comp;
			},
			onClick: (handler: () => void) => {
				buttonEl.addEventListener("click", handler);
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(buttonEl);
		return this;
	}
	addExtraButton(cb: (b: any) => any) {
		const buttonEl = new MockElement();
		const comp = {
			buttonEl,
			setIcon: () => comp,
			setTooltip: () => comp,
			setDisabled: (d: boolean) => {
				buttonEl.disabled = d;
				return comp;
			},
			onClick: (handler: () => void) => {
				buttonEl.addEventListener("click", handler);
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(buttonEl);
		return this;
	}
	addTextArea(cb: (ta: any) => any) {
		const inputEl = new MockElement();
		const comp = {
			inputEl,
			setValue: (v: string) => {
				inputEl.value = v;
				return comp;
			},
			onChange: (handler: (v: string) => void) => {
				inputEl.addEventListener("input", () => handler(inputEl.value));
				return comp;
			},
		};
		cb(comp);
		this.controlEl.appendChild(inputEl);
		return this;
	}
}

export class Notice {
	constructor(public msg: string) {}
}

export class Modal {
	constructor(public app: any) {}
	open() {}
	close() {}
}
