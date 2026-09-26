import { describe, expect, test } from "bun:test";
import { parseFragment } from "../src/js/select/tui/parse.js";

describe("parseFragment", () => {
	test("parses nested tags, boolean attrs, and colon names", () => {
		const ast = parseFragment(`
			<box border padding="2" on:keypress="keys">
				<text fg="#fff" out="label">Hi</text>
				<input inout="name" placeholder="x" />
			</box>
		`);
		const roots = ast.filter(
			(node) => node.type === "element" || `${node.value ?? ""}`.trim(),
		);
		expect(roots.length).toBe(1);
		const box = roots[0];
		expect(box.tag).toBe("box");
		expect(box.attrs.border).toBe(true);
		expect(box.attrs.padding).toBe("2");
		expect(box.attrs["on:keypress"]).toBe("keys");
		const kids = box.children.filter(
			(node) => node.type === "element" || `${node.value ?? ""}`.trim(),
		);
		expect(kids[0].tag).toBe("text");
		expect(kids[0].attrs.out).toBe("label");
		expect(kids[0].attrs.fg).toBe("#fff");
		expect(kids[0].children[0].value).toBe("Hi");
		expect(kids[1].tag).toBe("input");
		expect(kids[1].attrs.inout).toBe("name");
		expect(kids[1].children.length).toBe(0);
	});

	test("decodes named and numeric entities in text and attributes", () => {
		const ast = parseFragment(
			`<text title="a &amp; b">1 &lt; 2 &#62; 0 &#x27;q&#x27;</text>`,
		);
		const text = ast.filter((node) => node.type === "element")[0];
		expect(text.attrs.title).toBe("a & b");
		const content = text.children
			.filter((node) => node.type === "text")
			.map((node) => node.value)
			.join("");
		expect(content).toBe("1 < 2 > 0 'q'");
		const invalid = parseFragment("<text>&#x110000;</text>")[0];
		expect(invalid.children[0].value).toBe("&#x110000;");
	});
});
