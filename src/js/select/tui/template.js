// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/template
// `ui(source)` component factory: turns a template source into a renderable
// component, and exposes the select.js format registry on the `ui` function.
//
// Concepts:
// - *template component*: `ui(source)` where `source` is an inline markup
//   string, a markup tree, or a previously loaded template URL.
// - *component definition*: `ui.component(name)` lives in definition.js and is
//   bound to a source via `.using()`.
// - *external templates*: `ui.load(url)` lives in resources.js and caches a
//   template file so `ui(url)` / `.using(url)` can resolve it by URL.
// - *applied templates*: `Component.map` lives in applied.js and renders keyed
//   child lists.

import { FORMATS, format } from "select/features/formats.js";
import { mapTemplate } from "./applied.js";
import { TUIInstance } from "./instance.js";
import { markup } from "./markup.js";
import { astFor } from "./resources.js";

function unformat(name) {
	delete FORMATS[name];
}

function resolveFormat(name) {
	return FORMATS[name];
}

// Function: isTemplateComponent
// True when `value` is a renderable `ui(source)` component (as opposed to an
// unbound `ui.component(name)` definition or an applied-template wrapper).
function isTemplateComponent(value) {
	return value?.isTemplate === true;
}

// Function: applyDefinition
// Builds a renderable component from a definition and a template source.
function applyDefinition(definition, source) {
	const Component = ui(source);
	const template = Component.template;
	if (definition.initializer) {
		template.initializer = definition.initializer;
	}
	if (definition.behavior) {
		template.behavior = Object.assign({}, template.behavior, definition.behavior);
	}
	if (definition.subs) {
		template.subs = template.subs ?? new Map();
		for (const [event, handlers] of definition.subs) {
			const existing = template.subs.get(event);
			if (existing) {
				for (let i = 0; i < handlers.length; i++) {
					existing.push(handlers[i]);
				}
			} else {
				template.subs.set(event, handlers.slice());
			}
		}
	}
	if (definition.cleanup) {
		template.cleanup = definition.cleanup;
	}
	return Component;
}

// Function: rebind
// Returns a new component that reuses `template`'s behavior/init/cleanup/subs
// on a different presentation.
function rebind(template, source) {
	return applyDefinition(
		{
			initializer: template.initializer,
			behavior: template.behavior,
			subs: template.subs,
			cleanup: template.cleanup,
		},
		source,
	);
}

function ui(source) {
	const template = {
		ast: astFor(source),
		behavior: {},
		subs: undefined,
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
	// Subscribes to events published by child components. `event` is an event
	// name, or an object mapping names to handlers. Handler signature matches
	// select.js: `(instance, data, event)`; the payload is `event.data`.
	Component.sub = (event, handler = undefined) => {
		if (typeof event === "string") {
			if (!handler) {
				return Component;
			}
			template.subs = template.subs ?? new Map();
			if (template.subs.has(event)) {
				template.subs.get(event).push(handler);
			} else {
				template.subs.set(event, [handler]);
			}
		} else {
			for (const name in event) {
				Component.sub(name, event[name]);
			}
		}
		return Component;
	};
	Component.on = Component.sub;
	Component.cleanup = (handler) => {
		template.cleanup = handler;
		return Component;
	};
	Component.using = (next) => rebind(template, next);
	Component.map = (data, processor, key) => mapTemplate(Component, data, processor, key);
	Component.new = (parent, options) => new TUIInstance(template, parent, options);
	Component.apply = (data) => Component.new(null, { data });
	return Component;
}

ui.markup = markup;
ui.formats = FORMATS;
ui.format = format;
ui.unformat = unformat;
ui.resolveFormat = resolveFormat;

export { applyDefinition, isTemplateComponent, ui };

// EOF
