// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/events
// Event listening, capture and publication for `TUIInstance`. Mirrors
// select.js `components/events.js`: `on`/`off` runtime subs, `pub` bubbling
// through the instance chain with `false`/`null` stopping propagation, and
// `on:` slot effects (`@path` assign, `!Event` publish, else behavior).
// TUI delta: `keypress` routing to the focused subtree, `click` via
// `onMouseDown`, `in:`/`inout:` capture through the `input` event.

import { UIEvent } from "@ssebastien/select/ui/components/model.js";
import { resolveBindingValue, writeDataPath } from "@ssebastien/select/ui/eval.js";
import { isReactive } from "@ssebastien/select/utils/values.js";
import { scheduleRender } from "./reactive.js";
import { isPlainObject } from "./slots.js";

// Function: isWithin
// True when target is node or a descendant (focus routing).
function isWithin(node, target) {
	let cursor = target;
	while (cursor) {
		if (cursor === node) {
			return true;
		}
		cursor = cursor.parent;
	}
	return false;
}

// Function: listen
// Attaches a node listener; keypress routes via focus, click via onMouseDown.
function listen(instance, node, event, handler) {
	const keyInput = instance.renderer?.keyInput;
	if (event === "keypress") {
		if (!keyInput) {
			return null;
		}
		const routed = (keyEvent) => {
			const focused = instance.renderer?.currentFocusedRenderable;
			if (focused && !isWithin(node, focused)) {
				return;
			}
			handler(keyEvent);
		};
		keyInput.on("keypress", routed);
		return () => keyInput.off("keypress", routed);
	}
	if (event === "click") {
		node.onMouseDown = handler;
		return () => {
			if (node.onMouseDown === handler) {
				node.onMouseDown = undefined;
			}
		};
	}
	node.on(event, handler);
	return () => node.off(event, handler);
}

// Function: attachCapture
// Captures input events back into data (cell-aware).
function attachCapture(instance, slot) {
	const handler = (value) => {
		const current = instance.data?.[slot.key];
		if (isReactive(current)) {
			current.set(value);
			return;
		}
		instance.update({ [slot.key]: value });
	};
	slot.node.on("input", handler);
	return () => slot.node.off("input", handler);
}

// Function: scopedData
// Instance data merged with row-local slot scope.
function scopedData(instance, slot) {
	if (!slot?.scope) {
		return instance.data || {};
	}
	return Object.assign({}, instance.data, slot.scope);
}

// Function: dispatch
// Calls a behavior; plain-object results update the data.
function dispatch(instance, name, event, data) {
	const handler = instance.template.behavior?.[name];
	if (typeof handler !== "function") {
		return;
	}
	const result = handler(instance, data || instance.data || {}, event);
	if (isPlainObject(result)) {
		instance.update(result);
	}
}

// Function: runEvent
// Runs an on: slot effect (assign/publish/behavior).
function runEvent(instance, slot, event) {
	const parsed = slot.parsed;
	if (!parsed) {
		return;
	}
	const data = scopedData(instance, slot);
	if (parsed.stopPropagation && typeof event?.stopPropagation === "function") {
		event.stopPropagation();
	}
	if (parsed.preventDefault && typeof event?.preventDefault === "function") {
		event.preventDefault();
	}
	if (parsed.mode === "assign") {
		writeDataPath(instance, parsed.targetPath, event);
		scheduleRender(instance);
		return;
	}
	if (parsed.mode === "publish") {
		let payload = data;
		if (parsed.binding) {
			payload = resolveBindingValue(data, parsed.binding, false, instance);
		}
		publish(instance, parsed.publishEvent, payload, true, event);
		return;
	}
	dispatch(instance, parsed.handlerName, event, data);
}

// Function: addRuntimeSub
// Adds a runtime pub/sub handler; returns the instance.
function addRuntimeSub(instance, event, handler) {
	if (!instance._runtimeSubs) {
		instance._runtimeSubs = new Map();
	}
	const list = instance._runtimeSubs.get(event);
	if (list) {
		list.push(handler);
	} else {
		instance._runtimeSubs.set(event, [handler]);
	}
	return instance;
}

// Function: removeRuntimeSub
// Removes a runtime pub/sub handler; returns the instance.
function removeRuntimeSub(instance, event, handler) {
	const list = instance._runtimeSubs?.get(event);
	if (!list) {
		return instance;
	}
	const i = list.indexOf(handler);
	if (i >= 0) {
		list.splice(i, 1);
	}
	return instance;
}

// Function: publish
// Bubbles an event up the instance chain with stop support.
function publish(instance, name, data, includeSelf = true, orig = undefined) {
	const payload = data === undefined ? instance.data || {} : data;
	const event = new UIEvent(name, payload, instance, orig);
	let current = instance;
	let first = true;
	while (current) {
		if (!first || includeSelf) {
			event.current = current;
			const selfData = current.data || {};
			const dispatchOne = (handler) => {
				const result = handler(current, selfData, event);
				if (isPlainObject(result)) {
					current.update(result);
				}
				return result === false || result === null ? "stop" : "continue";
			};
			if (current._runtimeSubs) {
				const list = current._runtimeSubs.get(name);
				if (list) {
					for (let i = 0; i < list.length; i++) {
						if (dispatchOne(list[i]) === "stop") {
							return instance;
						}
					}
				}
			}
			const subs = current.template?.subs?.get(name);
			if (subs) {
				for (let i = 0; i < subs.length; i++) {
					if (dispatchOne(subs[i]) === "stop") {
						return instance;
					}
				}
			}
		}
		first = false;
		current = current.parent;
	}
	return instance;
}

// Function: bindInstance
// Attaches on:/in:/inout: listeners for all collected slots.
function bindInstance(instance) {
	for (let i = 0; i < instance._on.length; i++) {
		const slot = instance._on[i];
		const un = listen(instance, slot.node, slot.event, (event) =>
			runEvent(instance, slot, event),
		);
		if (un) {
			instance._listeners.push(un);
		}
	}
	for (let i = 0; i < instance._inout.length; i++) {
		instance._listeners.push(attachCapture(instance, instance._inout[i]));
	}
	for (let i = 0; i < instance._in.length; i++) {
		instance._listeners.push(attachCapture(instance, instance._in[i]));
	}
}

// Function: unbindInstance
// Runs and clears all attached listener teardowns.
function unbindInstance(instance) {
	for (let i = 0; i < instance._listeners.length; i++) {
		instance._listeners[i]();
	}
	instance._listeners.length = 0;
}

export {
	addRuntimeSub,
	attachCapture,
	bindInstance,
	dispatch,
	isWithin,
	listen,
	publish,
	removeRuntimeSub,
	runEvent,
	scopedData,
	unbindInstance,
};

// EOF
