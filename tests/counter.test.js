import { describe, expect, test } from "bun:test";
import { cell, unwrap } from "select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

const Counter = ui(`
	<box width="42" height="9" alignItems="center" justifyContent="center" on:keypress="keys">
		<box width="38" height="7" padding="1" flexDirection="column" gap="1" alignItems="center">
			<text>Hello, OpenTUI!</text>
			<text out="label"></text>
			<text>left/right change | q quit</text>
		</box>
	</box>
`)
	.init(() => ({
		count: cell(0),
	}))
	.does({
		label: (_self, { count }) => `Count  ${unwrap(count)}`,
		keys: (self, { count }, key) => {
			const value = unwrap(count);
			if (key.name === "left") {
				self.update({ count: value - 1 });
			} else if (key.name === "right") {
				self.update({ count: value + 1 });
			}
		},
	});

describe("counter", () => {
	test("renders and updates on arrow keys", async () => {
		const setup = await testRender(Counter, { width: 42, height: 9 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Hello, OpenTUI!");
			expect(setup.captureCharFrame()).toContain("Count  0");

			setup.mockInput.pressArrow("right");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Count  1");

			setup.mockInput.pressArrow("left");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Count  0");
		} finally {
			setup.renderer.destroy();
		}
	});
});
