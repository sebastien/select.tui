// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/parse
// HTML fragment parser for TUI templates.

function parseFragment(source) {
	const input = `${source ?? ""}`;
	let i = 0;
	const n = input.length;

	function skipWs() {
		while (i < n) {
			const c = input[i];
			if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
				break;
			}
			i++;
		}
	}

	function parseName() {
		const start = i;
		while (i < n) {
			const c = input[i];
			const ok =
				(c >= "a" && c <= "z") ||
				(c >= "A" && c <= "Z") ||
				(c >= "0" && c <= "9") ||
				c === "-" ||
				c === "_" ||
				c === ":";
			if (!ok) {
				break;
			}
			i++;
		}
		return input.slice(start, i);
	}

	function parseAttrValue() {
		const q = input[i];
		if (q === '"' || q === "'") {
			i++;
			const start = i;
			while (i < n && input[i] !== q) {
				i++;
			}
			const value = input.slice(start, i);
			if (i < n) {
				i++;
			}
			return value;
		}
		const start = i;
		while (i < n) {
			const c = input[i];
			if (
				c === " " ||
				c === "\t" ||
				c === "\n" ||
				c === "\r" ||
				c === ">" ||
				c === "/"
			) {
				break;
			}
			i++;
		}
		return input.slice(start, i);
	}

	function parseNodes() {
		const nodes = [];
		while (i < n) {
			if (input.startsWith("<!--", i)) {
				const end = input.indexOf("-->", i + 4);
				i = end === -1 ? n : end + 3;
				continue;
			}
			if (input[i] === "<") {
				if (input.startsWith("</", i)) {
					break;
				}
				nodes.push(parseElement());
				continue;
			}
			const start = i;
			while (i < n && input[i] !== "<") {
				i++;
			}
			nodes.push({ type: "text", value: input.slice(start, i) });
		}
		return nodes;
	}

	function parseElement() {
		i++;
		const tag = parseName().toLowerCase();
		const attrs = {};
		while (i < n) {
			skipWs();
			if (i >= n) {
				break;
			}
			if (input[i] === ">") {
				i++;
				const children = parseNodes();
				if (input.startsWith("</", i)) {
					i += 2;
					parseName();
					skipWs();
					if (input[i] === ">") {
						i++;
					}
				}
				return { type: "element", tag, attrs, children };
			}
			if (input[i] === "/" && input[i + 1] === ">") {
				i += 2;
				return { type: "element", tag, attrs, children: [] };
			}
			const name = parseName();
			if (!name) {
				i++;
				continue;
			}
			skipWs();
			if (input[i] === "=") {
				i++;
				skipWs();
				attrs[name] = parseAttrValue();
			} else {
				attrs[name] = true;
			}
		}
		return { type: "element", tag, attrs, children: [] };
	}

	return parseNodes();
}

export { parseFragment };

// EOF
