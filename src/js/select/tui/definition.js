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
// - *aliases*: `componentName`/`doCleanup` are canonical (select.js);
//   `name`/`cleanup` are kept in sync for compatibility.

import {
	createDescriptorState,
	mergeDescriptorBehavior,
	mergeDescriptorSub,
	setDescriptorCleanup,
} from "./descriptor.js";
import { applyDefinition } from "./template.js";

// Function: createDefinition
// Logic-only component: chainable `.init/.does/.cleanup`, renderable only
// after `.using(source)` binds it to a template.
function createDefinition(name = null) {
	const definition = createDescriptorState(name);

	function unbound() {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before rendering`,
		);
	}

	unbound.isTemplate = false;
	unbound.isComponentDefinition = true;
	unbound.template = null;
	unbound.definition = definition;
	// Function: unbound.init
	// Sets the pending initializer; applied to the template on `.using()`.
	unbound.init = (initializer) => {
		definition.initializer = initializer;
		return unbound;
	};
	// Function: unbound.does
	// Merges pending behavior; applied to the template on `.using()`.
	unbound.does = (behavior) => {
		mergeDescriptorBehavior(definition, behavior);
		return unbound;
	};
	// Function: unbound.sub
	// Subscribes to events published by child components; same contract as
	// select.js `template.sub(event, handler)` / `.sub({ Event: handler })`.
	unbound.sub = (event, handler = undefined) => {
		mergeDescriptorSub(definition, event, handler);
		return unbound;
	};
	// Function: unbound.on
	// Alias of `unbound.sub`.
	unbound.on = unbound.sub;
	// Function: unbound.cleanup
	// Sets the pending dispose handler (both `doCleanup`/`cleanup` aliases).
	unbound.cleanup = (handler) => {
		setDescriptorCleanup(definition, handler);
		return unbound;
	};
	// Function: unbound.using
	// Binds the definition to `source` and returns a renderable component.
	unbound.using = (source) => applyDefinition(definition, source);
	// Function: unbound.map
	// Throws until `.using()` binds the definition (mirrors select.js).
	unbound.map = (..._args) => {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .map(...)`,
		);
	};
	// Function: unbound.new
	// Throws until `.using()` binds the definition (mirrors select.js).
	unbound.new = (..._args) => {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .new(...)`,
		);
	};
	// Function: unbound.apply
	// Throws until `.using()` binds the definition (mirrors select.js).
	unbound.apply = (..._args) => {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .apply(...)`,
		);
	};
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
