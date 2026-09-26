import { afterAll, describe, expect, test } from "bun:test";
import { extend, testRender, ui } from "../src/js/select/tui/index.js";

describe("in: propagation", () => {
	const Label = ui(`<box><text out="line"></text></box>`).does({
		line: (_self, data) => data.who,
	});
	extend({ ininputslabel: Label });

	test("plain parent values re-sync the child on update", async () => {
		const App = ui(`<box><ininputslabel in:who="name" /></box>`).init(() => ({
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
		const App = ui(`<box><ininputslabel in:who="user.name" /></box>`).init(
			() => ({
				user: { name: "linus" },
			}),
		);
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

afterAll(() => {
	extend({ ininputslabel: null });
});

// EOF
