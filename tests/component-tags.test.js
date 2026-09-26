import { afterAll, describe, expect, test } from "bun:test";
import { cell, unwrap } from "select/state/cells";
import { extend, testRender, ui } from "../src/js/select/tui/index.js";

describe("component tags", () => {
	const Greeting = ui(`
		<box flexDirection="column">
			<text out="line"></text>
		</box>
	`)
		.init((_self, data) => ({ ...data, extra: cell("!") }))
		.does({
			line: (_self, data) => {
				const who = unwrap(data.who);
				return `hi ${who ?? "?"}${unwrap(data.extra)}`;
			},
		});

	test("renders a nested instance with in: data", async () => {
		extend({ greeting: Greeting });
		const App = ui(`
			<box flexDirection="column">
				<greeting in:who="name" width="20" height="2" />
			</box>
		`).init(() => ({ name: cell("ada") }));
		const setup = await testRender(App, {
			width: 20,
			height: 4,
			useMouse: true,
		});
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("hi ada!");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("child pub bubbles to the parent behavior", async () => {
		extend({ greeting2: Greeting });
		let seen = null;
		const Inner = ui(`<box><text on:click="!Hello" out="msg"></text></box>`)
			.does({
				msg: () => "click me",
			})
			.sub("Hello", (self) => self.pub("greet", "ping"));
		const App = ui(`
			<box>
				<inner2 />
			</box>
		`).sub("greet", (_self, _data, event) => {
			seen = event.data;
		});
		extend({ inner2: Inner });
		const setup = await testRender(App, {
			width: 20,
			height: 4,
			useMouse: true,
		});
		try {
			await setup.renderOnce();
			await setup.mockMouse.click(1, 0);
			await setup.renderOnce();
			expect(seen).toBe("ping");
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("scrollbox tag", () => {
	test("renders children in a scrollable box", async () => {
		const Box = ui(`
			<scrollbox height="3" width="10">
				<text>one</text>
				<text>two</text>
			</scrollbox>
		`);
		const setup = await testRender(Box, { width: 12, height: 5 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("one");
		} finally {
			setup.renderer.destroy();
		}
	});
});

afterAll(() => {
	extend({ greeting: null, greeting2: null, inner2: null });
});
