// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/ids
// Instance identity registry. Mirrors select.js `instance.js`
// `createUIInstanceId/getUIInstance/registerUIInstance/unregisterUIInstance`
// (TUI delta: silent override on duplicates instead of `log.warn`).

const TUI_INSTANCES = new Map();
let tuiInstanceId = 0;

// Function: createTUIInstanceId
// Returns a fresh `tui-N` identifier.
function createTUIInstanceId() {
	tuiInstanceId += 1;
	return `tui-${tuiInstanceId}`;
}

// Function: getTUIInstance
// Looks up a live instance by id; `undefined` for missing/blank ids.
function getTUIInstance(id) {
	if (typeof id !== "string") {
		return undefined;
	}
	const key = id.trim();
	return key ? TUI_INSTANCES.get(key) : undefined;
}

// Function: registerTUIInstance
// Tracks the instance under its id; later registrations win silently.
function registerTUIInstance(instance) {
	if (!instance?.id) {
		return instance;
	}
	TUI_INSTANCES.set(instance.id, instance);
	return instance;
}

// Function: unregisterTUIInstance
// Removes the registry entry when it still points at `instance`.
function unregisterTUIInstance(instance) {
	if (!instance?.id) {
		return instance;
	}
	if (TUI_INSTANCES.get(instance.id) === instance) {
		TUI_INSTANCES.delete(instance.id);
	}
	return instance;
}

export {
	createTUIInstanceId,
	getTUIInstance,
	registerTUIInstance,
	unregisterTUIInstance,
};

// EOF
