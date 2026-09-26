import { describe, expect, test } from "bun:test";
import { cell, unwrap } from "select/state/cells";
import { markup } from "../src/js/select/tui/markup.js";
import { testRender, ui } from "../src/js/select/tui/index.js";

describe("markup", () => {
	test("builds the same tree shape as HTML", () => {
		const { box, input, text } = markup;
		const tree = box(
			{ border: true, padding: 2, "on:keypress": "keys" },
			text({ fg: "#fff", out: "label" }, "Hi"),
			input({ inout: "name", placeholder: "x" }),
		);
		expect(tree.type).toBe("element");
		expect(tree.tag).toBe("box");
		expect(tree.attrs.border).toBe(true);
		expect(tree.attrs.padding).toBe(2);
		expect(tree.attrs["on:keypress"]).toBe("keys");
		expect(tree.children[0].tag).toBe("text");
		expect(tree.children[0].attrs.out).toBe("label");
		expect(tree.children[0].children[0].value).toBe("Hi");
		expect(tree.children[1].tag).toBe("input");
		expect(tree.children[1].attrs.inout).toBe("name");
	});

	test("treats a first non-attrs argument as a child", () => {
		const { text } = markup;
		const tree = text("Hello");
		expect(tree.attrs).toEqual({});
		expect(tree.children[0].value).toBe("Hello");
	});

	test("renders through ui()", async () => {
		const { box, text } = ui.markup;
		const Counter = ui(
			box(
				{ width: 20, height: 3, "on:keypress": "keys" },
				text({ out: "label" }),
			),
		)
			.init(() => ({ count: cell(0) }))
			.does({
				label: (_self, { count }) => `Count  ${unwrap(count)}`,
				keys: (self, { count }, key) => {
					const value = unwrap(count);
					if (key.name === "right") {
						self.update({ count: value + 1 });
					}
				},
			});
		const setup = await testRender(Counter, { width: 20, height: 3 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Count  0");
			setup.mockInput.pressArrow("right");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Count  1");
		} finally {
			setup.renderer.destroy();
		}
	});
});
