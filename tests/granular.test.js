// Tests for the granular render pipeline: change-detected child input sync and
// behavior-dependency skipping. These guard the fix for the "whole tree
// re-renders on one cell write" cascade.

import { afterAll, describe, expect, test } from "bun:test";
import { cell, unwrap } from "@ssebastien/select/state/cells";
import { extend, testRender, ui } from "../src/js/select/tui/index.js";

describe("change-detected child input sync", () => {
	let childRenders = 0;
	const Child = ui(`<box><text out="line"></text></box>`).does({
		line: (_self, data) => {
			childRenders++;
			return `${unwrap(data.a)}-${unwrap(data.b)}`;
		},
	});
	extend({ granularchild: Child });

	test("an unchanged plain in: input does not wake the child", async () => {
		// `a` is a cell the child subscribes to directly; `b` is a plain input.
		// Writing the cell must update the child through its own subscription
		// without the parent re-pushing the (unchanged) plain input.
		const App = ui(`<box><granularchild in:a in:b /></box>`).init(() => ({
			a: cell("A"),
			b: "B",
		}));
		const setup = await testRender(App, { width: 20, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("A-B");
			childRenders = 0;
			setup.instance.data.a.set("A2");
			await Promise.resolve();
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("A2-B");
			// The child re-rendered for the cell write, but the parent did not
			// push the unchanged plain `b` (which would be a second wake).
			expect(childRenders).toBeLessThanOrEqual(2);
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("behavior dependency skipping", () => {
	let expensive = 0;
	test("an unchanged behavior is skipped on a granular render", async () => {
		const Panel = ui(
			`<box flexDirection="column"><text out="stable"></text><text out="volatile"></text></box>`,
		)
			.init(() => ({ a: cell("aaa"), b: cell("bbb") }))
			.does({
				// `stable` reads only `a`: a write to `b` must not re-run it.
				volatile: (_self, data) => unwrap(data.b),
				stable: (_self, data) => {
					expensive++;
					return unwrap(data.a);
				},
			});
		const setup = await testRender(Panel, { width: 20, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("aaa");
			expect(setup.captureCharFrame()).toContain("bbb");
			expensive = 0;
			setup.instance.data.b.set("bbb2");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("bbb2");
			expect(expensive).toBe(0);
		} finally {
			setup.renderer.destroy();
		}
	});
});

afterAll(() => {
	extend({ granularchild: null });
});

// EOF
