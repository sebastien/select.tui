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
// - *applied templates*: `Component.apply`/`Component.map` live in applied.js
//   and render single wrappers / keyed child lists.
//
// Not ported from select.js `factory.js` (intentional TUI subset):
// - CSS selectors, DOM nodes, `<template>` registries, `#Key` references,
//   `singleton`, `lexicalTemplates`/`localTemplates`, `<slot>` content slots,
//   `<style>` extraction, `Dynamic`/`lazy`/`register`/`resolve` helpers.

import { FORMATS, format } from "select/features/formats.js";
import { applyTemplate, mapTemplate } from "./applied.js";
import {
	cloneDescriptorState,
	getDescriptorCleanup,
	mergeDescriptorBehavior,
	mergeDescriptorSub,
	setDescriptorCleanup,
} from "./descriptor.js";
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
// Accepts both `componentName/doCleanup` (select.js) and `name/cleanup`
// (legacy TUI) descriptor shapes.
function applyDefinition(definition, source) {
	const Component = ui(source);
	const template = Component.template;
	if (definition.initializer) {
		template.initializer = definition.initializer;
	}
	if (definition.behavior) {
		template.behavior = Object.assign(
			{},
			template.behavior,
			definition.behavior,
		);
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
	const cleanup = getDescriptorCleanup(definition);
	if (cleanup) {
		setDescriptorCleanup(template, cleanup);
	}
	const componentName = definition.componentName ?? definition.name ?? null;
	if (componentName) {
		template.componentName = componentName;
		template.name = componentName;
	}
	return Component;
}

// Function: rebind
// Returns a new component that reuses `template`'s behavior/init/cleanup/subs
// on a different presentation.
function rebind(template, source) {
	return applyDefinition(cloneDescriptorState(template), source);
}

function ui(source) {
	const template = {
		ast: astFor(source),
		behavior: {},
		subs: undefined,
		doCleanup: null,
		cleanup: null,
		initializer: null,
		componentName: null,
		name: null,
	};

	// Callable facade mirrors select.js `createComponent`: calling the
	// component returns an applied-template wrapper (`apply`), mounting uses
	// `.new()`. Use `render(Component)` / `testRender(Component)` for top-level
	// instances; `Component(data)` is for `out`-slot lists, not mounting.
	function Component(...args) {
		return Component.apply(...args);
	}

	Component.isTemplate = true;
	Component.template = template;
	Component.definition = template;
	Component.singleton = null;
	// Function: Component.init
	// Sets the state initializer `(self, data) => state`. A returned object
	// replaces the data; top-level cells stay subscribed per instance.
	Component.init = (initializer) => {
		template.initializer = initializer;
		return Component;
	};
	// Function: Component.does
	// Merges behavior handlers `(self, data, event) => patch`. Returning a
	// plain object updates the data.
	Component.does = (behavior) => {
		mergeDescriptorBehavior(template, behavior);
		return Component;
	};
	// Function: Component.sub
	// Subscribes to events published by child components. `event` is an event
	// name, or an object mapping names to handlers. Handler signature matches
	// select.js: `(instance, data, event)`; the payload is `event.data`.
	Component.sub = (event, handler = undefined) => {
		mergeDescriptorSub(template, event, handler);
		return Component;
	};
	// Function: Component.on
	// Alias of `Component.sub`, mirroring select.js definition methods.
	Component.on = Component.sub;
	// Function: Component.cleanup
	// Sets the dispose handler `(self, data) => …`, stored as both
	// `doCleanup` (select.js) and `cleanup` (legacy TUI) aliases.
	Component.cleanup = (handler) => {
		setDescriptorCleanup(template, handler);
		return Component;
	};
	// Function: Component.using
	// Returns a new component reusing this behavior on another presentation.
	Component.using = (next) => rebind(template, next);
	// Function: Component.map
	// Maps a collection to keyed wrappers; see `applied.js#mapTemplate`.
	Component.map = (data, processor, key) =>
		mapTemplate(Component, data, processor, key);
	// Function: Component.new
	// Creates a `TUIInstance`; the mount path (`render`/`testRender`/lists).
	Component.new = (parent, options) =>
		new TUIInstance(template, parent, options);
	// Function: Component.apply
	// Returns a single applied wrapper; see `applied.js#applyTemplate`.
	Component.apply = (data) => applyTemplate(Component, data);
	return Component;
}

ui.markup = markup;
ui.formats = FORMATS;
ui.format = format;
ui.unformat = unformat;
ui.resolveFormat = resolveFormat;

export { applyDefinition, isTemplateComponent, ui };

// EOF
