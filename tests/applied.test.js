import { describe, expect, test } from "bun:test";
import {
	isAppliedTemplate,
	isTemplateComponent,
	testRender,
	ui,
} from "../src/js/select/tui/index.js";

describe("applied wrappers", () => {
	test("calling the component returns a wrapper, not an instance", () => {
		const Panel = ui(`<box><text out="v"></text></box>`);
		const wrapper = Panel({ v: "hi" });
		expect(isAppliedTemplate(wrapper)).toBe(true);
		expect(isTemplateComponent(wrapper)).toBe(false);
		expect(wrapper.template).toBe(Panel);
		expect(wrapper.data).toEqual({ v: "hi" });
	});

	test("apply reuses wrapper identity per $key", () => {
		const Panel = ui(`<box><text out="v"></text></box>`);
		const first = Panel.apply({ v: "a", $key: "k" });
		const second = Panel.apply({ v: "b", $key: "k" });
		expect(second).toBe(first);
		expect(first.data).toEqual({ v: "b", $key: "k" });
		const other = Panel.apply({ v: "c", $key: "j" });
		expect(other).not.toBe(first);
	});

	test("testRender unwraps an applied wrapper", async () => {
		const Panel = ui(`<box><text out="v"></text></box>`);
		const setup = await testRender(Panel({ v: "hi" }), {
			width: 20,
			height: 4,
		});
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("hi");
		} finally {
			setup.renderer.destroy();
		}
	});

	test("unbound definition new/apply/map throw like select.js", () => {
		const Def = ui.component("UnboundApplied");
		expect(() => Def.new()).toThrow(/before \.new/);
		expect(() => Def.apply({})).toThrow(/before \.apply/);
		expect(() => Def.map([])).toThrow(/before \.map/);
	});
});

// EOF
