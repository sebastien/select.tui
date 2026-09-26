import { describe, expect, test } from "bun:test";
import { render, testRender, ui } from "../src/js/select/tui/index.js";

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
			expect(setup.renderer.isDestroyed).toBe(false);
		} finally {
			setup.renderer.destroy();
		}
	});

	test("render() accepts an applied wrapper", async () => {
		const { createTestRenderer } = await import("@opentui/core/testing");
		const setup = await createTestRenderer({ width: 20, height: 4 });
		const Panel = ui(`<box><text out="v"></text></box>`);
		const instance = await render(Panel({ v: "wrapped" }), setup.renderer);
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("wrapped");
			instance.quit();
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

// EOF
