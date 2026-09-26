import { afterAll, describe, expect, test } from "bun:test";
import { cell } from "select/state/cells";
import { extend, testRender, ui } from "../src/js/select/tui/index.js";

function Lines(init) {
	return ui(`
		<box flexDirection="column">
			<box each="items">
				<text out="line"></text>
			</box>
		</box>
	`)
		.init(init)
		.does({ line: (_self, data) => `${data.key}=${data.item.name ?? data.item}` });
}

describe("each collections", () => {
	test("Map yields values as items and keys as keys", async () => {
		const List = Lines(() => ({
			items: cell(
				new Map([
					["a", { name: "alpha" }],
					["b", { name: "beta" }],
				]),
			),
		}));
		const setup = await testRender(List, { width: 24, height: 6 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("a=alpha");
			expect(frame).toContain("b=beta");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("plain object yields values as items and property names as keys", async () => {
		const List = Lines(() => ({
			items: cell({ first: { name: "one" }, second: { name: "two" } }),
		}));
		const setup = await testRender(List, { width: 24, height: 6 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("first=one");
			expect(frame).toContain("second=two");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("Set yields values with the value as key", async () => {
		const List = Lines(() => ({ items: cell(new Set(["x", "y"])) }));
		const setup = await testRender(List, { width: 24, height: 6 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("x=x");
			expect(frame).toContain("y=y");
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("each on component tags", () => {
	test("repeats a component once per item with scoped in: data", async () => {
		const Row = ui(`<box><text out="line"></text></box>`).does({
			line: (_self, data) => data.label,
		});
		extend({ rowitem: Row });
		const List = ui(`
			<box flexDirection="column">
				<rowitem each="items" in:label="item.label" />
			</box>
		`).init(() => ({
			items: cell([{ label: "one" }, { label: "two" }]),
		}));
		const setup = await testRender(List, { width: 20, height: 6 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("one");
			expect(frame).toContain("two");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("disposes per-row component instances when rows are removed", async () => {
		let disposed = 0;
		const Row = ui(`<box><text out="line"></text></box>`)
			.cleanup(() => {
				disposed += 1;
			})
			.does({ line: (_self, data) => data.label });
		extend({ rowdispose: Row });
		const List = ui(`
			<box flexDirection="column">
				<rowdispose each="items" in:label="item.label" />
			</box>
		`).init(() => ({
			items: cell([{ label: "one" }, { label: "two" }]),
		}));
		const setup = await testRender(List, { width: 20, height: 6 });
		try {
			await setup.renderOnce();
			expect(setup.instance._children.length).toBe(2);
			setup.instance.data.items.set([{ label: "one" }]);
			await Promise.resolve();
			await setup.renderOnce();
			expect(disposed).toBe(1);
			expect(setup.instance._children.length).toBe(1);
			expect(setup.captureCharFrame()).not.toContain("two");
		} finally {
			setup.renderer.destroy();
		}
	});
});

afterAll(() => {
	extend({ rowitem: null, rowdispose: null });
});
