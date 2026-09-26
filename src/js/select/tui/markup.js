// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/markup
// Hyperscript tag factories that build the same AST as HTML templates.
// TUI-only (no select.js counterpart): `markup.box(attrs, ...children)`
// mirrors JSX-like construction for programmatic templates.

import { parseFragment } from "./parse.js";

// Function: isMarkupNode
// True for AST element/text nodes.
function isMarkupNode(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		(value.type === "element" || value.type === "text")
	);
}

// Function: isAttrs
// True for a plain attribute bag (not a child node/array).
function isAttrs(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!isMarkupNode(value)
	);
}

// Function: flatten
// Flattens nested children; strings become text nodes.
function flatten(children, out) {
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child === null || child === undefined || child === false) {
			continue;
		}
		if (Array.isArray(child)) {
			flatten(child, out);
			continue;
		}
		if (typeof child === "string" || typeof child === "number") {
			out.push({ type: "text", value: `${child}` });
			continue;
		}
		if (isMarkupNode(child)) {
			out.push(child);
			continue;
		}
		throw new TypeError("select/tui markup: unexpected child");
	}
	return out;
}

// Function: element
// Builds an element AST node from tag/attrs/children.
function element(tag, attrs, children) {
	return {
		type: "element",
		tag,
		attrs: attrs || {},
		children,
	};
}

// Function: tagFactory
// Returns a hyperscript factory for one tag name.
function tagFactory(tag) {
	return (attrs, ...rest) => {
		if (isAttrs(attrs)) {
			return element(tag, attrs, flatten(rest, []));
		}
		return element(tag, {}, flatten([attrs, ...rest], []));
	};
}

// Function: createMarkup
// Creates the markup proxy with per-tag memoization.
function createMarkup() {
	const tags = new Map();
	return new Proxy(Object.create(null), {
		get(_scope, property) {
			if (typeof property !== "string") {
				return undefined;
			}
			let factory = tags.get(property);
			if (!factory) {
				factory = tagFactory(property);
				tags.set(property, factory);
			}
			return factory;
		},
	});
}

const markup = createMarkup();

// Function: toAst
// Normalizes a string/tree/array source to an AST array.
function toAst(source) {
	if (typeof source === "string") {
		return parseFragment(source);
	}
	if (Array.isArray(source)) {
		return source;
	}
	if (isMarkupNode(source)) {
		return [source];
	}
	throw new TypeError("ui: expected an HTML string or markup tree");
}

export { isMarkupNode, markup, toAst };

// EOF
