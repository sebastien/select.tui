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
