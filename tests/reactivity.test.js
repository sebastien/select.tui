import { describe, expect, test } from "bun:test";
import { cell } from "@ssebastien/select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

describe("init() data seeding", () => {
	test("construction data survives under init state", async () => {
		const Panel = ui(
			`<box flexDirection="column"><text out="a"></text><text out="b"></text></box>`,
		)
			.init(() => ({ b: "state-b" }))
			.does({
				a: (_self, data) => data.a ?? "missing-a",
				b: (_self, data) => data.b ?? "missing-b",
			});
		const setup = await testRender(Panel, {
			data: { a: "passed-a" },
			height: 4,
			width: 20,
		});
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("passed-a");
			expect(frame).toContain("state-b");
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

// EOF
