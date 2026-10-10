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

import { eq } from "@ssebastien/select/utils/index.js";
import { isReactive } from "@ssebastien/select/utils/values.js";

// Function: normalizeCellNotifyPath
// Normalizes a cell notify path to an array of segments, or `null` when the
// whole value was replaced (a root write). Mirrors select.js
// `components/reactive.js#normalizeCellNotifyPath`.
function normalizeCellNotifyPath(path) {
	if (path === undefined || path === null) {
		return null;
	}
	// Cells use an object sentinel for a root write; it is not a path segment.
	if (!Array.isArray(path) && typeof path === "object") {
		return null;
	}
	const segments = Array.isArray(path) ? path : [path];
	if (!segments.length) {
		return null;
	}
	// pathify("a.b") yields ["a.b"]; split dotted segments for direct updates.
	if (segments.length === 1 && typeof segments[0] === "string") {
		const raw = segments[0];
		if (raw.includes(".")) {
			return raw.split(".").map((part) => {
				if (part === "") {
					return part;
				}
				const n = Number(part);
				return Number.isInteger(n) && String(n) === part ? n : part;
			});
		}
	}
	return segments;
}

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
	const keys = Object.keys(data);
	const byValue = new Map();
	for (let i = 0; i < keys.length; i++) {
		const value = data[keys[i]];
		if (!isReactive(value)) {
			continue;
		}
		if (byValue.has(value)) {
			byValue.get(value).add(keys[i]);
		} else {
			byValue.set(value, new Set([keys[i]]));
		}
	}
	for (const [value, valueKeys] of byValue) {
		subscribeValue(instance, value, valueKeys);
	}
}

// Function: subscribeValue
// Subscribes a single reactive value to re-render.
//
// The handler is path-aware: a scalar root write (path carries no segments)
// that names a top-level data key triggers a direct `out` update on the slots
// bound to that key (`_tryDirectOutUpdate`), and otherwise schedules a render
// narrowed to the keys the cell is bound to (`meta.keys`). Root-store replaces
// and unresolvable paths fall back to a full render. This mirrors select.js
// `syncReactiveDataSubs` so a cell write no longer re-renders every slot.
function subscribeValue(instance, value, keys = null) {
	if (!isReactive(value)) {
		return;
	}
	const meta = { keys: keys ?? null, handler: null };
	const handler = (_next, path) => {
		const normalized = normalizeCellNotifyPath(path);
		if (normalized && normalized.length === 1) {
			const key = normalized[0];
			if (typeof key === "string" && instance._tryDirectOutUpdate(key, _next)) {
				return;
			}
		}
		if (!normalized) {
			// Root write: the whole cell changed. Narrow to the data keys bound
			// to this cell (the caller's `keys`); fall back to a full render for
			// a root-store cell with no named host.
			if (meta.keys?.size) {
				if (meta.keys.size === 1) {
					const key = meta.keys.values().next().value;
					if (typeof key === "string" && instance._tryDirectOutUpdate(key, _next)) {
						return;
					}
				}
				scheduleRender(instance, meta.keys);
			} else {
				scheduleRender(instance);
			}
			return;
		}
		if (!meta.keys?.size) {
			if (typeof normalized[0] === "string") {
				scheduleRender(instance, new Set([normalized[0]]));
			} else {
				scheduleRender(instance);
			}
			return;
		}
		scheduleRender(instance, meta.keys);
	};
	value.sub(handler);
	instance._subs.push([value, handler, meta]);
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
// Queues a microtask render unless disposed/queued. `changedKeys` narrows the
// render to the data keys that changed (granular skip); a null/empty set means
// a full render. When a render is already queued the keys merge into the
// pending set so no change is lost. Mirrors select.js `_scheduleRender`.
function scheduleRender(instance, changedKeys = null) {
	if (instance._queued || instance._disposed) {
		if (changedKeys?.size) {
			if (!instance._pendingChangedKeys) {
				instance._pendingChangedKeys = new Set();
			}
			for (const key of changedKeys) {
				instance._pendingChangedKeys.add(key);
			}
		}
		return;
	}
	if (changedKeys?.size) {
		instance._pendingChangedKeys = new Set(changedKeys);
	}
	instance._queued = true;
	queueMicrotask(() => {
		const pending = instance._pendingChangedKeys;
		instance._pendingChangedKeys = undefined;
		instance._queued = false;
		if (!instance._disposed) {
			instance._render(pending ?? null);
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
// Merges a patch with cell write-through, then re-renders the changed keys.
// When no key actually changes, no render is scheduled (a no-op patch must not
// wake the tree). A reactive current value written through a plain `next`
// (`current.set(next)`) is left to the cell's own subscription, so it is not
// counted as a plain change.
function updateData(instance, data) {
	if (!data || typeof data !== "object") {
		return setData(instance, data);
	}
	if (!instance.data || typeof instance.data !== "object") {
		instance.data = {};
	}
	let changedKeys = null;
	for (const key in data) {
		const current = instance.data[key];
		const next = data[key];
		if (isReactive(current) && !isReactive(next)) {
			if (!eq(current.value, next)) {
				changedKeys = changedKeys ?? new Set();
				changedKeys.add(key);
			}
			current.set(next);
			continue;
		}
		if (isReactive(current) && isReactive(next) && current !== next) {
			unsubscribeValue(instance, current);
		}
		if (isReactive(next) && !isReactive(current)) {
			subscribeValue(instance, next);
		}
		if (!eq(current, next)) {
			changedKeys = changedKeys ?? new Set();
			changedKeys.add(key);
		}
		instance.data[key] = next;
	}
	if (changedKeys?.size) {
		scheduleRender(instance, changedKeys);
	}
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
