// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/catalogue
// Tag names to OpenTUI renderable classes (or nested `ui()` components) and
// attribute coercion.

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

const catalogue = {
	box: { Class: BoxRenderable },
	input: { Class: InputRenderable, contentProp: "value" },
	scrollbox: { Class: ScrollBoxRenderable },
	text: { Class: TextRenderable, contentProp: "content" },
};

// Function: extend
// Registers tags. Values are renderable classes, `{ Class, contentProp? }`
// descriptors, or `ui()` templates (nested components). Passing `null` or
// `undefined` removes a previously registered tag.
function extend(components) {
	for (const name in components) {
		const value = components[name];
		if (value === null || value === undefined) {
			delete catalogue[name];
			continue;
		}
		if (value.isComponentDefinition) {
			throw new Error(
				`extend(): <${name}> is an unbound ui.component(...) definition; bind it with .using(...) before registering`,
			);
		}
		if (value.isTemplate) {
			catalogue[name] = { Component: value };
		} else {
			catalogue[name] = value.Class ? value : { Class: value };
		}
	}
	return catalogue;
}

function getCatalogue() {
	return catalogue;
}

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

function coerceOptions(attrs) {
	const options = {};
	for (const name in attrs) {
		options[name] = coerceValue(name, attrs[name]);
	}
	return options;
}

export { coerceOptions, extend, getCatalogue };

// EOF
