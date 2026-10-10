// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/catalogue
// Host-tag registry: tag names to OpenTUI renderable classes (or nested `ui()`
// components) and attribute coercion. Intentionally distinct from select.js
// `COMPONENTS` (Dynamic components): this maps TUI host tags (`box`, `text`,
// `input`, `scrollbox`), not logic components.

import {
	BoxRenderable,
	InputRenderable,
	ScrollBoxRenderable,
	TextRenderable,
} from "@opentui/core";

const BOOLEAN_ATTRS = new Set([
	"border",
	"buffered",
	"focusable",
	"focused",
	"live",
	"selectable",
	"shouldFill",
	"visible",
]);

const NUMBER_ATTRS = new Set([
	"bottom",
	"columnGap",
	"flexBasis",
	"flexGrow",
	"flexShrink",
	"gap",
	"height",
	"left",
	"margin",
	"marginBottom",
	"marginLeft",
	"marginRight",
	"marginTop",
	"marginX",
	"marginY",
	"maxHeight",
	"maxWidth",
	"minHeight",
	"minWidth",
	"opacity",
	"padding",
	"paddingBottom",
	"paddingLeft",
	"paddingRight",
	"paddingTop",
	"paddingX",
	"paddingY",
	"right",
	"rowGap",
	"top",
	"width",
	"zIndex",
]);

// Function: hideScrollBars
// select.tui keeps the cursor on screen itself, so a scrollbox's scrollbar
// chrome is noise. Hide both bars while leaving them in the tree, so destroy
// and layout stay consistent. Applied to every scrollbox by `configure`.
function hideScrollBars(node) {
	for (const bar of [node.verticalScrollBar, node.horizontalScrollBar]) {
		bar?.resetVisibilityControl?.();
		if (bar) bar.visible = false;
	}
}

const TAGS = {
	box: { Class: BoxRenderable },
	input: { Class: InputRenderable, contentProp: "value" },
	scrollbox: { Class: ScrollBoxRenderable, configure: hideScrollBars },
	text: { Class: TextRenderable, contentProp: "content" },
};

// Function: extend
// Registers host tags. Values are renderable classes, `{ Class, contentProp? }`
// descriptors, or `ui()` templates (nested components). Passing `null` or
// `undefined` removes a previously registered tag.
function extend(components) {
	for (const name in components) {
		const value = components[name];
		if (value === null || value === undefined) {
			delete TAGS[name];
			continue;
		}
		if (value.isComponentDefinition) {
			throw new Error(
				`extend(): <${name}> is an unbound ui.component(...) definition; bind it with .using(...) before registering`,
			);
		}
		if (value.isTemplate) {
			TAGS[name] = { Component: value };
		} else {
			TAGS[name] = value.Class ? value : { Class: value };
		}
	}
	return TAGS;
}

// Function: getTags
// Returns the live host-tag registry for advanced introspection.
function getTags() {
	return TAGS;
}

// Function: getCatalogue
// Compatibility alias of `getTags` (legacy TUI name).
function getCatalogue() {
	return TAGS;
}

// Function: coerceValue
// Coerces a single host attribute: booleans for `BOOLEAN_ATTRS`, numbers for
// `NUMBER_ATTRS`, other strings pass through unchanged.
function coerceValue(name, value) {
	if (value === true || value === false) {
		return value;
	}
	if (BOOLEAN_ATTRS.has(name)) {
		if (value === "" || value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}
	}
	if (
		typeof value === "string" &&
		NUMBER_ATTRS.has(name) &&
		/^-?\d+(\.\d+)?$/.test(value)
	) {
		return Number(value);
	}
	return value;
}

// Function: coerceOptions
// Coerces an attribute bag via `coerceValue` for OpenTUI construction.
function coerceOptions(attrs) {
	const options = {};
	for (const name in attrs) {
		options[name] = coerceValue(name, attrs[name]);
	}
	return options;
}

export { coerceOptions, extend, getCatalogue, getTags };

// EOF
