// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/definition
// `ui.component(name)` logic-only component definitions. A definition holds
// behavior/init/cleanup and is not renderable until bound to a presentation
// with `.using(source)`.
//
// Concepts:
// - *component definition*: the unbound object built by `ui.component(name)`.
// - *binding*: `.using(source)` applies the definition to a `ui()` template.

import { applyDefinition } from "./template.js";

// Function: createDefinition
// Logic-only component: chainable `.init/.does/.cleanup`, renderable only
// after `.using(source)` binds it to a template.
function createDefinition(name = null) {
	const definition = {
		name,
		behavior: {},
		subs: undefined,
		cleanup: null,
		initializer: null,
	};

	function unbound() {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before rendering`,
		);
	}

	unbound.isTemplate = false;
	unbound.isComponentDefinition = true;
	unbound.template = null;
	unbound.definition = definition;
	unbound.init = (initializer) => {
		definition.initializer = initializer;
		return unbound;
	};
	unbound.does = (behavior) => {
		definition.behavior = Object.assign(definition.behavior, behavior);
		return unbound;
	};
	// Subscribes to events published by child components; same contract as
	// select.js `template.sub(event, handler)` / `.sub({ Event: handler })`.
	unbound.sub = (event, handler = undefined) => {
		if (typeof event === "string") {
			if (!handler) {
				return unbound;
			}
			definition.subs = definition.subs ?? new Map();
			if (definition.subs.has(event)) {
				definition.subs.get(event).push(handler);
			} else {
				definition.subs.set(event, [handler]);
			}
		} else {
			for (const name in event) {
				unbound.sub(name, event[name]);
			}
		}
		return unbound;
	};
	unbound.on = unbound.sub;
	unbound.cleanup = (handler) => {
		definition.cleanup = handler;
		return unbound;
	};
	unbound.using = (source) => applyDefinition(definition, source);
	unbound.map = () => {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): call .using(...) before .map(...)`,
		);
	};
	unbound.new = unbound;
	unbound.apply = unbound;
	return unbound;
}

// Function: component
// Public `ui.component(name)` entry point.
function component(name) {
	return createDefinition(name);
}

// Function: isComponentDefinition
// True when `value` is an unbound `ui.component(name)` definition. A bound
// definition is a template component and is reported by `isTemplateComponent`.
function isComponentDefinition(value) {
	return value?.isComponentDefinition === true;
}

export { component, isComponentDefinition };

// EOF
