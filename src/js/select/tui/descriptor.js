// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/descriptor
// Shared descriptor helpers for `ui(source)` components and
// `ui.component(name)` definitions. Mirrors select.js
// `factory.js#cloneSubs/createDefinitionState/cloneDefinitionState/mergeDefinitionBehavior/mergeDefinitionSub/applyDefinitionToTemplate`.
// A descriptor holds `componentName/initializer/behavior/subs/doCleanup`;
// `name` and `cleanup` are kept as compatibility aliases.

// Function: cloneSubs
// Copies a `Map<event, handlers[]>` so rebinding never shares handler arrays.
function cloneSubs(subs) {
	if (!subs) {
		return undefined;
	}
	const res = new Map();
	for (const [event, handlers] of subs.entries()) {
		res.set(event, handlers.slice());
	}
	return res;
}

// Function: createDescriptorState
// Fresh descriptor with canonical `componentName`/`doCleanup` plus legacy
// `name`/`cleanup` aliases kept in sync.
function createDescriptorState(name = null) {
	return {
		componentName: name,
		name,
		initializer: null,
		behavior: {},
		subs: undefined,
		doCleanup: null,
		cleanup: null,
	};
}

// Function: cloneDescriptorState
// Copies behavior/subs/cleanup so `.using()` never shares mutable state.
function cloneDescriptorState(source) {
	const base = source ?? createDescriptorState();
	return {
		componentName: base.componentName ?? base.name ?? null,
		name: base.name ?? base.componentName ?? null,
		initializer: base.initializer,
		behavior: base.behavior ? { ...base.behavior } : {},
		subs: cloneSubs(base.subs),
		doCleanup: base.doCleanup ?? base.cleanup ?? null,
		cleanup: base.cleanup ?? base.doCleanup ?? null,
	};
}

// Function: mergeDescriptorBehavior
// Merges `behavior` into the descriptor, mirroring select.js.
function mergeDescriptorBehavior(descriptor, behavior) {
	descriptor.behavior = Object.assign(descriptor.behavior ?? {}, behavior);
}

// Function: mergeDescriptorSub
// Adds `event → handler` (or an object map) to the descriptor subs.
function mergeDescriptorSub(descriptor, event, handler = undefined) {
	if (typeof event === "string") {
		if (!handler) {
			return descriptor;
		}
		if (!descriptor.subs) {
			descriptor.subs = new Map();
		}
		if (descriptor.subs.has(event)) {
			descriptor.subs.get(event).push(handler);
		} else {
			descriptor.subs.set(event, [handler]);
		}
		return descriptor;
	}
	for (const key in event) {
		mergeDescriptorSub(descriptor, key, event[key]);
	}
	return descriptor;
}

// Function: setDescriptorCleanup
// Sets both `doCleanup` and `cleanup` aliases to `handler`.
function setDescriptorCleanup(descriptor, handler) {
	descriptor.doCleanup = handler;
	descriptor.cleanup = handler;
}

// Function: getDescriptorCleanup
// Returns `doCleanup ?? cleanup`, the effective dispose handler.
function getDescriptorCleanup(descriptor) {
	return descriptor.doCleanup ?? descriptor.cleanup ?? null;
}

export {
	cloneDescriptorState,
	cloneSubs,
	createDescriptorState,
	getDescriptorCleanup,
	mergeDescriptorBehavior,
	mergeDescriptorSub,
	setDescriptorCleanup,
};

// EOF
