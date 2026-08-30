// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/template
// `ui(html)` component factory.

import { FORMATS, format } from "select/features/formats.js";
import { TUIInstance } from "./instance.js";
import { markup, toAst } from "./markup.js";

function unformat(name) {
	delete FORMATS[name];
}

function resolveFormat(name) {
	return FORMATS[name];
}

function ui(source) {
	const template = {
		ast: toAst(source),
		behavior: {},
		cleanup: null,
		initializer: null,
	};

	function Component(data) {
		return Component.new(null, data !== undefined ? { data } : undefined);
	}

	Component.isTemplate = true;
	Component.template = template;
	Component.init = (initializer) => {
		template.initializer = initializer;
		return Component;
	};
	Component.does = (behavior) => {
		template.behavior = Object.assign(template.behavior, behavior);
		return Component;
	};
	Component.cleanup = (handler) => {
		template.cleanup = handler;
		return Component;
	};
	Component.new = (parent, options) => new TUIInstance(template, parent, options);
	Component.apply = (data) => Component.new(null, { data });
	return Component;
}

ui.markup = markup;
ui.formats = FORMATS;
ui.format = format;
ui.unformat = unformat;
ui.resolveFormat = resolveFormat;

export { ui };

// EOF
