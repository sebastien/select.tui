import { describe, expect, test } from "bun:test";
import { cell, unwrap } from "@ssebastien/select/state/cells";
import {
	extend,
	getTUIInstance,
	testRender,
	ui,
} from "../src/js/select/tui/index.js";

describe("effect", () => {
	test("runs setup and tracks teardown for dispose", async () => {
		let setups = 0;
		let teardowns = 0;
		const Panel = ui(`<box><text out="v"></text></box>`).init(() => ({
			v: "hi",
		}));
		const setup = await testRender(Panel, { width: 20, height: 4 });
		try {
			setup.instance.effect(() => {
				setups += 1;
			});
			setup.instance.effect((self) => {
				expect(self).toBe(setup.instance);
				return () => {
					teardowns += 1;
				};
			});
			expect(setups).toBe(1);
			expect(teardowns).toBe(0);
			setup.instance.dispose();
			expect(teardowns).toBe(1);
		} finally {
			setup.renderer.destroy();
		}
	});

	test("ignores non-functions and disposed instances", async () => {
		const Panel = ui(`<box><text out="v"></text></box>`);
		const setup = await testRender(Panel, { width: 20, height: 4 });
		try {
			expect(setup.instance.effect(null)).toBe(setup.instance);
			setup.instance.dispose();
			expect(setup.instance.effect(() => {})).toBe(setup.instance);
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("provide/inject", () => {
	test("injects ancestor values with defaults and chaining", async () => {
		const Child = ui(`<box><text out="line"></text></box>`).does({
			line: (self) => {
				const theme = self.inject("theme", "light");
				return unwrap(theme);
			},
		});
		extend({ lifecyclechild: Child });
		try {
			const App = ui(`<box><lifecyclechild /></box>`);
			const setup = await testRender(App, { width: 20, height: 4 });
			try {
				setup.instance.provide("theme", "dark");
				const child = setup.instance._children[0];
				expect(child.inject("theme")).toBe("dark");
				expect(child.inject("missing", "fallback")).toBe("fallback");
				expect(setup.instance.provide("k", 1)).toBe(setup.instance);
			} finally {
				setup.renderer.destroy();
			}
		} finally {
			extend({ lifecyclechild: null });
		}
	});

	test("nearest ancestor wins and cells re-render injectors", async () => {
		const theme = cell("dark");
		const Child = ui(`<box height="1"><text out="line"></text></box>`).does({
			line: (self) => unwrap(self.inject("theme", "none")),
		});
		extend({ lifecyclegrandchild: Child });
		const Middle = ui(
			`<box flexDirection="column"><lifecyclegrandchild width="20" height="1" /></box>`,
		).init((self) => {
			self.provide("theme", "local");
			return {};
		});
		extend({ lifecyclemiddle: Middle });
		try {
			const App = ui(
				`<box flexDirection="column"><lifecyclemiddle width="20" height="2" /></box>`,
			).init((self) => {
				self.provide("theme", theme);
				return {};
			});
			const setup = await testRender(App, { width: 20, height: 4 });
			try {
				await setup.renderOnce();
				expect(setup.captureCharFrame()).toContain("local");
			} finally {
				setup.renderer.destroy();
			}
			const LiveChild = ui(
				`<box height="1"><text out="line"></text></box>`,
			).does({
				line: (self) => unwrap(self.inject("theme", "none")),
			});
			extend({ lifecyclelivechild: LiveChild });
			try {
				const LiveApp = ui(
					`<box flexDirection="column"><lifecyclelivechild width="20" height="1" /></box>`,
				).init((self) => {
					self.provide("theme", theme);
					return {};
				});
				const live = await testRender(LiveApp, { width: 20, height: 4 });
				try {
					await live.renderOnce();
					expect(live.captureCharFrame()).toContain("dark");
					theme.set("solarized");
					await Promise.resolve();
					await live.renderOnce();
					expect(live.captureCharFrame()).toContain("solarized");
				} finally {
					live.renderer.destroy();
				}
			} finally {
				extend({ lifecyclelivechild: null });
			}
		} finally {
			extend({ lifecyclegrandchild: null, lifecyclemiddle: null });
		}
	});
});

describe("instance ids", () => {
	test("unique ids, explicit ids, lookup and release", async () => {
		const Panel = ui(`<box><text out="v"></text></box>`);
		const first = await testRender(Panel, { width: 20, height: 4 });
		const second = await testRender(Panel, { width: 20, height: 4 });
		try {
			expect(first.instance.id).toMatch(/^tui-\d+$/);
			expect(second.instance.id).not.toBe(first.instance.id);
			expect(getTUIInstance(first.instance.id)).toBe(first.instance);
			expect(getTUIInstance("  ")).toBeUndefined();
			expect(getTUIInstance(null)).toBeUndefined();
			const named = Panel.new(null, { id: "  custom  " });
			expect(named.id).toBe("custom");
			expect(getTUIInstance("custom")).toBe(named);
			named.dispose();
			expect(getTUIInstance("custom")).toBeUndefined();
			first.instance.dispose();
			expect(getTUIInstance(first.instance.id)).toBeUndefined();
		} finally {
			second.instance.dispose();
			first.renderer.destroy();
			second.renderer.destroy();
		}
	});
});

// EOF
