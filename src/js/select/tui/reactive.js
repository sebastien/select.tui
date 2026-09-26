// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-09-27

// Module: select/tui/reactive
// Reactive data subscriptions and render scheduling for `TUIInstance`.
// Mirrors select.js `components/reactive.js` (top-level cell subscriptions +
// `set`/`update` with cell write-through), scoped to the TUI subset: top-level
// cells stay subscribed for the instance lifetime; plain values write through
// existing cells without detaching.

import { isReactive } from "select/utils/values.js";

// Function: subscribe
// Subscribes top-level reactive cells of the instance data.
// Function: seedInitializerState
// Merges plain-object construction `data` under plain-object `state` from
// `init()`, mirroring select.js: keys the initializer does not own survive
// the first render while derived state wins on collisions. Non-plain data
// (cells, arrays) or state pass through as `state`.
function seedInitializerState(data, state) {
	if (
		data === null ||
		data === undefined ||
		typeof data !== "object" ||
		Object.getPrototypeOf(data) !== Object.prototype ||
		state === null ||
		state === undefined ||
		typeof state !== "object" ||
		Object.getPrototypeOf(state) !== Object.prototype
	) {
		return state;
	}
	return { ...data, ...state };
}

function subscribe(instance) {
	const data = instance.data;
	if (!data || typeof data !== "object") {
		return;
	}
	for (const key in data) {
		subscribeValue(instance, data[key]);
	}
}

// Function: subscribeValue
// Subscribes a single reactive value to re-render.
function subscribeValue(instance, value) {
	if (!isReactive(value)) {
		return;
	}
	const handler = () => scheduleRender(instance);
	value.sub(handler);
	instance._subs.push([value, handler]);
}

// Function: unsubscribeValue
// Removes a reactive subscription by value identity.
function unsubscribeValue(instance, value) {
	for (let i = 0; i < instance._subs.length; i++) {
		if (instance._subs[i][0] === value) {
			value.unsub(instance._subs[i][1]);
			instance._subs.splice(i, 1);
			return;
		}
	}
}

// Function: scheduleRender
// Queues a microtask render unless disposed/queued.
function scheduleRender(instance) {
	if (instance._queued || instance._disposed) {
		return;
	}
	instance._queued = true;
	queueMicrotask(() => {
		instance._queued = false;
		if (!instance._disposed) {
			instance._render();
		}
	});
}

// Function: setData
// Replaces instance data, resubscribes and re-renders.
function setData(instance, data) {
	instance.data = data === undefined || data === null ? {} : data;
	for (let i = 0; i < instance._subs.length; i++) {
		instance._subs[i][0].unsub(instance._subs[i][1]);
	}
	instance._subs.length = 0;
	subscribe(instance);
	scheduleRender(instance);
	return instance;
}

// Function: updateData
// Merges a patch with cell write-through, then re-renders.
function updateData(instance, data) {
	if (!data || typeof data !== "object") {
		return setData(instance, data);
	}
	if (!instance.data || typeof instance.data !== "object") {
		instance.data = {};
	}
	for (const key in data) {
		const current = instance.data[key];
		const next = data[key];
		if (isReactive(current) && !isReactive(next)) {
			current.set(next);
			continue;
		}
		if (isReactive(current) && isReactive(next) && current !== next) {
			unsubscribeValue(instance, current);
		}
		if (isReactive(next) && !isReactive(current)) {
			subscribeValue(instance, next);
		}
		instance.data[key] = next;
	}
	scheduleRender(instance);
	return instance;
}

export {
	scheduleRender,
	seedInitializerState,
	setData,
	subscribe,
	subscribeValue,
	unsubscribeValue,
	updateData,
};

// EOF
