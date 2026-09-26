import { describe, expect, test } from "bun:test";
import { cell } from "select/state/cells";
import {
	extend,
	isAppliedTemplate,
	isComponentDefinition,
	isTemplateComponent,
	testRender,
	ui,
} from "../src/js/select/tui/index.js";

const PILL = `
	<box flexDirection="column">
		<text out="title"></text>
		<text out="body"></text>
	</box>
`;

const CARD = `
	<box border="true">
		<text out="title"></text>
	</box>
`;

describe("ui.component and .using", () => {
	test("binds one definition to a template and renders", async () => {
		const Badge = ui.component("Badge").does({
			title: (_self, { title }) => `[${title}]`,
			body: (_self, { body }) => body,
		});
		const Pill = Badge.using(PILL);
		const setup = await testRender(
			Pill.init(() => ({ title: "hello", body: "world" })),
			{ width: 24, height: 4 },
		);
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("[hello]");
			expect(setup.captureCharFrame()).toContain("world");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("binds the same definition to two presentations", async () => {
		const Badge = ui.component("Badge").does({
			title: (_self, { title }) => `[${title}]`,
			body: (_self, { body }) => body,
		});
		const Pill = Badge.using(PILL).init(() => ({ title: "pill", body: "b" }));
		const Card = Badge.using(CARD).init(() => ({ title: "card", body: "b" }));
		const pillSetup = await testRender(Pill, { width: 24, height: 4 });
		const cardSetup = await testRender(Card, { width: 24, height: 4 });
		try {
			await pillSetup.renderOnce();
			await cardSetup.renderOnce();
			expect(pillSetup.captureCharFrame()).toContain("[pill]");
			expect(cardSetup.captureCharFrame()).toContain("[card]");
		} finally {
			pillSetup.renderer.destroy();
			cardSetup.renderer.destroy();
		}
	});

	test("an unbound definition refuses to render", async () => {
		const Badge = ui.component("Badge").does({ title: () => "x" });
		expect(() => Badge.new()).toThrow(/not bound to a template/);
	});

	test("ui.load caches an external template for .using", async () => {
		const url = new URL("./fixtures/sample.xml", import.meta.url).href;
		const Badge = ui.component("Badge").does({
			title: (_self, { title }) => `loaded:${title}`,
			body: (_self, { body }) => body,
		});
		await ui.load(url);
		const Bound = Badge.using(url).init(() => ({ title: "t", body: "b" }));
		const setup = await testRender(Bound, { width: 24, height: 4 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("loaded:t");
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("Component.map", () => {
	const Row = ui(`<box flexDirection="row" height="1"><text out="label"></text></box>`).does({
		label: (_self, data) => data.item,
	});

	test("renders a mapped list through an out slot", async () => {
		const List = ui(`<box flexDirection="column" out="rows"></box>`).does({
			rows: (_self, data) =>
				Row.map(data.items, (item, index) => ({ item, index }), (item) => item),
		});
		const setup = await testRender(
			List.init(() => ({ items: ["alpha", "beta"] })),
			{ width: 16, height: 5 },
		);
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("alpha");
			expect(setup.captureCharFrame()).toContain("beta");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("reconciles adds, removals and reorder by key", async () => {
		const List = ui(`
			<box flexDirection="column" out="rows"></box>
		`).init(() => ({ items: cell(["alpha", "beta"]) }))
			.does({
				rows: (_self, data) =>
					Row.map(data.items, (item, index) => ({ item, index }), (item) => item),
			});
		const setup = await testRender(List, { width: 16, height: 5 });
		try {
			await setup.renderOnce();
			setup.instance.data.items.set(["beta", "gamma", "alpha"]);
			await Promise.resolve();
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("gamma");
			expect(frame).toContain("beta");
			expect(frame).toContain("alpha");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("clears mapped rows when the collection empties", async () => {
		const List = ui(`<box flexDirection="column" out="rows"></box>`)
			.init(() => ({ items: cell(["alpha"]) }))
			.does({
				rows: (_self, data) =>
					Row.map(data.items, (item, index) => ({ item, index })),
			});
		const setup = await testRender(List, { width: 16, height: 5 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("alpha");
			setup.instance.data.items.set([]);
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).not.toContain("alpha");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("keeps duplicate $key items as distinct rows", async () => {
		const List = ui(`<box flexDirection="column" out="rows"></box>`)
			.init(() => ({ items: ["X", "Y"] }))
			.does({
				rows: (_self, data) =>
					Row.map(data.items, (item) => ({ item }), () => "same"),
			});
		const setup = await testRender(List, { width: 16, height: 5 });
		try {
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("X");
			expect(frame).toContain("Y");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("replaces a row when the mapped component changes for a key", async () => {
		const RowA = ui(`<box height="1"><text out="label"></text></box>`).does({
			label: () => "from-A",
		});
		const RowB = ui(`<box height="1"><text out="label"></text></box>`).does({
			label: () => "from-B",
		});
		const List = ui(`<box flexDirection="column" out="rows"></box>`)
			.init(() => ({ useA: cell(true), items: ["k"] }))
			.does({
				rows: (_self, data) =>
					(data.useA ? RowA : RowB).map(
						data.items,
						(item) => ({ item }),
						() => "k",
					),
			});
		const setup = await testRender(List, { width: 16, height: 5 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("from-A");
			setup.instance.data.useA.set(false);
			await Promise.resolve();
			await setup.renderOnce();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("from-B");
			expect(frame).not.toContain("from-A");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("skips child updates when mapped data is unchanged", async () => {
		let labelCalls = 0;
		const LocalRow = ui(`<box height="1"><text out="label"></text></box>`).does({
			label: (_self, data) => {
				labelCalls++;
				return data.item;
			},
		});
		const List = ui(
			`<box flexDirection="column"><text out="title"></text><box out="rows"></box></box>`,
		)
			.init(() => ({ tick: cell(0), items: cell(["alpha"]) }))
			.does({
				title: (_self, { tick }) => `t${tick}`,
				rows: (_self, data) =>
					LocalRow.map(data.items, (item) => ({ item }), (item) => item),
			});
		const setup = await testRender(List, { width: 16, height: 5 });
		try {
			await setup.renderOnce();
			const afterFirst = labelCalls;
			expect(afterFirst).toBe(1);
			setup.instance.data.tick.set(1);
			await Promise.resolve();
			await setup.renderOnce();
			expect(labelCalls).toBe(afterFirst);
		} finally {
			setup.renderer.destroy();
		}
	});
});

describe("behavior data contract", () => {
	test("in: behavior sources receive unwrapped values", async () => {
		let seen = null;
		const Child = ui(`<box><text out="label"></text></box>`).does({
			label: (_self, { passed }) => String(passed),
		});
		extend({ auditchild: Child });
		const Parent = ui(
			`<box><auditchild in:passed="value" width="16" height="2"></auditchild></box>`,
		).does({
			value: (_self, { count }) => {
				seen = count;
				return count;
			},
		});
		const setup = await testRender(Parent.init(() => ({ count: cell(5) })), {
			width: 16,
			height: 4,
		});
		try {
			await setup.renderOnce();
			expect(seen).toBe(5);
		} finally {
			setup.renderer.destroy();
			extend({ auditchild: null });
		}
	});

	test("cleanup receives unwrapped values", async () => {
		let seen = null;
		const App = ui(`<box><text out="t"></text></box>`)
			.init(() => ({ count: cell(7) }))
			.does({ t: (_self, { count }) => `${count}` })
			.cleanup((_self, data) => {
				seen = data.count;
			});
		const setup = await testRender(App, { width: 8, height: 2 });
		setup.instance.dispose();
		setup.renderer.destroy();
		expect(seen).toBe(7);
	});

	test("pub keeps array payloads as arrays", async () => {
		const App = ui(`<box><text out="t"></text></box>`).does({
			t: () => "x",
			fire: (self) => {
				self.pub("payload", [cell(1), cell(2)]);
			},
		});
		let received = null;
		const setup = await testRender(App, { width: 8, height: 2 });
		setup.instance.on("payload", (_self, payload) => {
			received = payload;
		});
		setup.instance._dispatch("fire", null, undefined);
		setup.renderer.destroy();
		expect(Array.isArray(received)).toBe(true);
		expect(received).toEqual([1, 2]);
	});

	test("ui(url) without ui.load throws instead of parsing as markup", () => {
		expect(() => ui("./fixtures/never-loaded.xml")).toThrow(/not loaded/);
	});
});

describe("kind guards", () => {
	test("predicate helpers classify templates, definitions and applied wrappers", () => {
		const Template = ui(`<box><text out="x"></text></box>`);
		expect(isTemplateComponent(Template)).toBe(true);
		expect(isComponentDefinition(Template)).toBe(false);

		const Def = ui.component("GuardBadge");
		expect(isComponentDefinition(Def)).toBe(true);
		expect(isTemplateComponent(Def)).toBe(false);

		const Bound = Def.using(`<box><text out="x"></text></box>`);
		expect(isTemplateComponent(Bound)).toBe(true);
		expect(isComponentDefinition(Bound)).toBe(false);

		const item = Bound.map(["a"])[0];
		expect(isAppliedTemplate(item)).toBe(true);
		expect(isTemplateComponent(item)).toBe(false);
	});

	test("extend rejects an unbound definition", () => {
		const Def = ui.component("UnboundGuard");
		expect(() => extend({ unboundguard: Def })).toThrow(/unbound ui.component/);
	});
});
