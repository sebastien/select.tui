// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/parse
// HTML fragment parser for TUI templates. TUI-only (no DOM in Bun):
// mirrors select.js `HTML.parseFromString + pruneTemplateWhitespace` for the
// inline-markup subset. Not supported: `<template>` registries, `<style>`
// extraction, SVG namespaces, case-sensitive tags (tags lowercased).

const ENTITIES = {
	amp: "&",
	apos: "'",
	gt: ">",
	lt: "<",
	nbsp: "\u00a0",
	quot: '"',
};

// Function: decodeEntities
// Resolves named and numeric HTML entities in text and attribute values.
function decodeEntities(text) {
	if (text.indexOf("&") === -1) {
		return text;
	}
	return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
		if (body[0] === "#") {
			const hex = body[1] === "x" || body[1] === "X";
			const code = Number.parseInt(
				hex ? body.slice(2) : body.slice(1),
				hex ? 16 : 10,
			);
			if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
				return match;
			}
			return String.fromCodePoint(code);
		}
		const decoded = ENTITIES[body];
		return decoded !== undefined ? decoded : match;
	});
}

// Function: parseFragment
// Parses an HTML fragment string into TUI AST nodes
// (`{type:"element",tag,attrs,children}` / `{type:"text",value}`).
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
			return decodeEntities(value);
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
		return decodeEntities(input.slice(start, i));
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
			nodes.push({
				type: "text",
				value: decodeEntities(input.slice(start, i)),
			});
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
