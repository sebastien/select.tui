import { describe, expect, test } from "bun:test";
import { cell } from "select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

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
				wantFocus: (_self, { wantFocus }) => wantFocus,
			});
		const setup = await testRender(App, { width: 20, height: 5 });
		try {
			await setup.renderOnce();
			setup.mockInput.pressArrow("right");
			expect(left).toBe(1);
			expect(right).toBe(1);

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

// EOF
