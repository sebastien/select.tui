import { afterAll, describe, expect, test } from "bun:test";
import { cell } from "select/state/cells";
import { coerceOptions } from "../src/js/select/tui/catalogue.js";
import { extend, getCatalogue, render, testRender, ui } from "../src/js/select/tui/index.js";

describe("in: propagation", () => {
	const Label = ui(`<box><text out="line"></text></box>`).does({
		line: (_self, data) => data.who,
	});
	extend({ remedylabel: Label });

	test("plain parent values re-sync the child on update", async () => {
		const App = ui(`<box><remedylabel in:who="name" /></box>`).init(() => ({
			name: "ada",
		}));
		const setup = await testRender(App, { width: 20, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("ada");
			setup.instance.update({ name: "grace" });
			await Promise.resolve();
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("grace");
			expect(setup.captureCharFrame()).not.toContain("ada");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("dotted parent paths re-sync the child on update", async () => {
		const App = ui(`<box><remedylabel in:who="user.name" /></box>`).init(() => ({
			user: { name: "linus" },
		}));
		const setup = await testRender(App, { width: 20, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("linus");
			setup.instance.update({ user: { name: "margaret" } });
			await Promise.resolve();
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("margaret");
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("update() reactivity", () => {
	test("subscribes to a cell assigned through update", async () => {
		const Panel = ui(`<box><text out="n"></text></box>`).init(() => ({ n: 0 }));
		const setup = await testRender(Panel, { width: 10, height: 3 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("0");
			setup.instance.update({ n: cell(1) });
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("1");
			setup.instance.data.n.set(2);
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("2");
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("keypress routing", () => {
	test("only handlers on the focused subtree fire", async () => {
		let left = 0;
		let right = 0;
		const App = ui(`
			<box flexDirection="column">
				<box on:keypress="leftKeys"><text>left</text></box>
				<box on:keypress="rightKeys"><input out:focused="wantFocus" /></box>
			</box>
		`)
			.init(() => ({ wantFocus: cell(false) }))
			.does({
				leftKeys: () => {
					left += 1;
				},
				rightKeys: () => {
					right += 1;
				},
				wantFocus: (_self, { wantFocus }) => wantFocus.value,
			});
		const setup = await testRender(App, { width: 20, height: 5 });
		try {
			await setup.renderOnce();
			// Nothing focused: every keypress handler is eligible.
			setup.mockInput.pressArrow("right");
			expect(left).toBe(1);
			expect(right).toBe(1);

			// Focus the input inside the right box: only its ancestors fire.
			setup.instance.data.wantFocus.set(true);
			await Promise.resolve();
			await setup.renderOnce();
			setup.mockInput.pressArrow("right");
			expect(left).toBe(1);
			expect(right).toBe(2);
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("extend registry", () => {
	test("removes a tag when passed null", () => {
		extend({ remedytemp: ui(`<box />`) });
		expect(getCatalogue().remedytemp).toBeDefined();
		extend({ remedytemp: null });
		expect(getCatalogue().remedytemp).toBeUndefined();
	});
});

describe("attribute coercion", () => {
	test("booleans and numbers are coerced, other strings are left alone", () => {
		expect(coerceOptions({ border: "false" }).border).toBe(false);
		expect(coerceOptions({ visible: "" }).visible).toBe(true);
		expect(coerceOptions({ title: "false" }).title).toBe("false");
		expect(coerceOptions({ width: "10" }).width).toBe(10);
		expect(coerceOptions({ width: "auto" }).width).toBe("auto");
	});
});

describe("host", () => {
	test("render() mounts into an existing renderer and quit() disposes only the instance", async () => {
		const { createTestRenderer } = await import("@opentui/core/testing");
		const setup = await createTestRenderer({ width: 20, height: 4 });
		const Panel = ui(`<box><text out="v"></text></box>`).init(() => ({
			v: "hi",
		}));
		const instance = await render(Panel, setup.renderer);
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("hi");
			instance.quit();
			expect(instance._disposed).toBe(true);
			// Reusing an external renderer must not destroy it.
			expect(setup.renderer.isDestroyed).toBe(false);
		} finally {
			setup.renderer.destroy();
		}
	});

	test("testRender() rejects and cleans up when the component throws", async () => {
		class Boom {
			static new() {
				throw new Error("boom");
			}
		}
		await expect(testRender(Boom, { width: 10, height: 3 })).rejects.toThrow(
			"boom",
		);
	});
});

afterAll(() => {
	extend({ remedylabel: null, remedytemp: null });
});
