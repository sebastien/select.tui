import { describe, expect, test } from "bun:test";
import { cell, unwrap } from "select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

const Panel = ui(`
	<box flexDirection="column">
		<text out="title"></text>
		<text when="showHint" out="hint"></text>
	</box>
`)
	.init(() => ({
		hint: cell("hint"),
		showHint: cell(true),
		title: cell("Hello"),
	}))
	.does({
		hint: (_self, { hint }) => unwrap(hint),
		showHint: (_self, { showHint }) => unwrap(showHint),
		title: (_self, { title }) => unwrap(title),
	});

describe("slots", () => {
	test("out and when update in place", async () => {
		const setup = await testRender(Panel, { width: 20, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Hello");
			expect(setup.captureCharFrame()).toContain("hint");

			setup.instance.data.title.set("Next");
			setup.instance.data.showHint.set(false);
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Next");
			expect(setup.captureCharFrame()).not.toContain("hint");
		} finally {
			setup.renderer.destroy();
		}
	});
});
