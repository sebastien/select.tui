import { describe, expect, test } from "bun:test";
import { coerceOptions } from "../src/js/select/tui/catalogue.js";
import {
	extend,
	getCatalogue,
	getTags,
	ui,
} from "../src/js/select/tui/index.js";

describe("extend registry", () => {
	test("removes a tag when passed null", () => {
		extend({ cataloguetemp: ui(`<box />`) });
		expect(getCatalogue().cataloguetemp).toBeDefined();
		extend({ cataloguetemp: null });
		expect(getCatalogue().cataloguetemp).toBeUndefined();
	});

	test("getTags is the canonical registry with getCatalogue alias", () => {
		expect(getTags()).toBe(getCatalogue());
		expect(getTags().box).toBeDefined();
	});
});

describe("attribute coercion", () => {
	test("booleans and numbers are coerced, other strings are left alone", () => {
		expect(coerceOptions({ border: "false" }).border).toBe(false);
		expect(coerceOptions({ visible: "" }).visible).toBe(true);
		expect(coerceOptions({ title: "false" }).title).toBe("false");
		expect(coerceOptions({ width: "10" }).width).toBe(10);
		expect(coerceOptions({ width: "auto" }).width).toBe("auto");
	});
});

// EOF
