// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/catalogue
// Tag names to OpenTUI renderable classes and attribute coercion.

import {
	BoxRenderable,
	InputRenderable,
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
	text: { Class: TextRenderable, contentProp: "content" },
};

function extend(components) {
	for (const name in components) {
		const value = components[name];
		catalogue[name] = value.Class ? value : { Class: value };
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
	if (value === "" && BOOLEAN_ATTRS.has(name)) {
		return true;
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
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
