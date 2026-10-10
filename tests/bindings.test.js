import { afterAll, describe, expect, test } from "bun:test";
import { cell, unwrap } from "@ssebastien/select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

ui.format("upper", (value) => `${value ?? ""}`.toUpperCase());

afterAll(() => {
	ui.unformat("upper");
});

describe("binding language", () => {
	test("out processors and when shorthands", async () => {
		const Panel = ui(`
			<box flexDirection="column">
				<text out="title|upper"></text>
				<text when="!hide" out="hint"></text>
				<text when="status==ready" out="ok"></text>
			</box>
		`)
			.init(() => ({
				hide: cell(false),
				hint: cell("hint"),
				ok: cell("yes"),
				status: cell("wait"),
				title: cell("hello"),
			}))
			.does({
				hint: (_self, { hint }) => hint,
				ok: (_self, { ok }) => ok,
				title: (_self, { title }) => title,
			});
		const setup = await testRender(Panel, { width: 20, height: 6 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("HELLO");
			expect(setup.captureCharFrame()).toContain("hint");
			expect(setup.captureCharFrame()).not.toContain("yes");

			setup.instance.data.hide.set(true);
			setup.instance.data.status.set("ready");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).not.toContain("hint");
			expect(setup.captureCharFrame()).toContain("yes");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("out:attr template and pub", async () => {
		const App = ui(`
			<box flexDirection="column">
				<text out="label"></text>
				<text on:keypress="!Bump"></text>
			</box>
		`)
			.init(() => ({
				n: cell(0),
			}))
			.does({
				label: (_self, { n }) => `n=${unwrap(n)}`,
			})
			.sub("Bump", (self, data) => {
				self.update({ n: unwrap(data.n) + 1 });
			});
		const setup = await testRender(App, { width: 16, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("n=0");
			setup.instance.pub("Bump");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("n=1");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("on assign writes a cell", async () => {
		const Form = ui(`
			<box>
				<input inout="name" on:input="@name" />
			</box>
		`).init(() => ({ name: cell("") }));
		const setup = await testRender(Form, { width: 20, height: 3 });
		try {
			await setup.renderOnce();
			const input = setup.instance._inout[0].node;
			input.value = "Ada";
			input.emit("input", "Ada");
			await Promise.resolve();
			expect(setup.instance.data.name.value).toBe("Ada");
		} finally {
			setup.renderer.destroy();
		}
	});
});
