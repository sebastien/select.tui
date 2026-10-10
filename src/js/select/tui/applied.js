// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/applied
// Keyed applied-template wrappers returned by `Component.apply`/`Component.map`
// and the helpers that produce them. An `AppliedTemplate` is bound to a
// component and carries a data bag with a stable `$key`; `TUIInstance` renders
// each one as a reconciled child instance.
//
// Mirrors select.js `UITemplate.apply`/`UITemplate.map` (see
// `select/ui/components/template.js`): `apply` returns a single wrapper with
// stable identity per `$key` via `_applyCache`, `map` preserves the input
// container shape via `remap`. TUI deltas: wrappers hold the component facade
// (so lists call `wrapper.template.new(...)`) with caches on the facade
// rather than the template object; duplicate keys render as distinct rows
// (`#index` fallback) instead of collapsing.

import { unwrap } from "@ssebastien/select/state/cells";
import { remap as remapCollection } from "@ssebastien/select/utils/transform.js";
import { isReactive } from "@ssebastien/select/utils/values.js";

// Function: resolveKeyPath
// Resolves a dotted key path (e.g. `"user.id"` or `".id"`) against `value`.
// Same semantics as the `key` path selector in select.js `UITemplate.map`.
function resolveKeyPath(value, path) {
	if (value === null || value === undefined) return undefined;
	const parts = `${path}`.replace(/^\./, "").split(".");
	let cursor = value;
	for (let i = 0; i < parts.length; i++) {
		if (cursor === null || cursor === undefined) return undefined;
		cursor = cursor[parts[i]];
	}
	return cursor;
}

// Class: AppliedTemplate
// A keyed `{ template, data }` wrapper returned by `Component.map`. It is a
// class instance (not a plain object) so select.js value expansion leaves it
// untouched.
class AppliedTemplate {
	constructor(template, data) {
		this.isAppliedTemplate = true;
		this.template = template;
		this.data = data;
	}
}

// Function: isAppliedTemplate
// True when `value` is an `AppliedTemplate` produced by `Component.apply` or
// `Component.map`.
function isAppliedTemplate(value) {
	return value instanceof AppliedTemplate;
}

// Creates a data bag that is safe for a rendered instance to retain. Mirrors
// select.js `copyAppliedData`: copies only the outer container so nested
// in-place mutations retain identity (replace nested values or use cells).
function copyAppliedData(data) {
	if (Array.isArray(data)) {
		return data.slice();
	}
	if (
		data !== null &&
		typeof data === "object" &&
		Object.getPrototypeOf(data) === Object.prototype
	) {
		return { ...data };
	}
	return data;
}

// Function: applyTemplate
// Returns an `AppliedTemplate` for `component` with `data`, mirroring
// select.js `UITemplate.apply`: when `data` carries a `$key`, the same wrapper
// object is returned for that key on subsequent calls (stable identity),
// updating the wrapper's data bag.
function applyTemplate(component, data) {
	data = copyAppliedData(data);
	const k = data && typeof data === "object" ? data.$key : undefined;
	if (k != null) {
		const cache = component._applyCache ?? (component._applyCache = new Map());
		if (cache.has(k)) {
			const at = cache.get(k);
			at.data = data;
			return at;
		}
		const at = new AppliedTemplate(component, data);
		cache.set(k, at);
		return at;
	}
	return new AppliedTemplate(component, data);
}

// Function: appliedDataEquals
// Shallow equality for two applied data bags, used to skip redundant child
// updates when a mapped list re-renders with unchanged data. Nested objects
// are compared by identity: replace them (or use cells) to signal change.
function appliedDataEquals(a, b) {
	if (Object.is(a, b)) return true;
	if (
		a === null ||
		b === null ||
		typeof a !== "object" ||
		typeof b !== "object" ||
		Array.isArray(a) !== Array.isArray(b)
	) {
		return false;
	}
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (let i = 0; i < aKeys.length; i++) {
		const key = aKeys[i];
		if (!Object.hasOwn(b, key) || !Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
}

// Function: isAppliedCollection
// True when `value` is a mapped collection of applied templates in any shape
// `Component.map` can return: an array, a Map, a Set or a plain object. Empty
// containers count as applied so a previously-populated slot can be cleared.
function isAppliedCollection(value) {
	if (Array.isArray(value)) {
		return value.every((item) => isAppliedTemplate(item));
	}
	if (value instanceof Map) {
		for (const item of value.values()) {
			if (!isAppliedTemplate(item)) return false;
		}
		return true;
	}
	if (value instanceof Set) {
		for (const item of value) {
			if (!isAppliedTemplate(item)) return false;
		}
		return true;
	}
	if (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	) {
		for (const key in value) {
			if (!isAppliedTemplate(value[key])) return false;
		}
		return true;
	}
	return false;
}

function isEmptyAppliedCollection(value) {
	if (Array.isArray(value)) return value.length === 0;
	if (value instanceof Map || value instanceof Set) return value.size === 0;
	return (
		value !== null &&
		typeof value === "object" &&
		Object.keys(value).length === 0
	);
}

// Ordered applied-template items, flattening any collection shape.
function appliedCollectionItems(value) {
	if (Array.isArray(value)) return value;
	if (value instanceof Map) return Array.from(value.values());
	if (value instanceof Set) return Array.from(value);
	return Object.values(value);
}

// Function: mapTemplate
// Maps a collection through a component into keyed applied-template wrappers.
// A port of select.js `UITemplate.map(data, processor?, key?)` that preserves
// the input container shape via `remap` (array, Map, Set or plain object),
// matching select.js. `processor(value, indexOrKey)` builds each row's data;
// `key(value, indexOrKey)` (or a path string) sets its stable `$key`.
function mapTemplate(component, data, processor, key) {
	if (isReactive(data)) {
		data = unwrap(data);
	}
	if (processor == null && key == null) {
		return remapCollection(
			data,
			(v) => new AppliedTemplate(component, copyAppliedData(v)),
		);
	}
	const keyFn =
		key == null
			? null
			: typeof key === "function"
				? key
				: (value) => resolveKeyPath(value, key);
	const cache = component._mapCache ?? (component._mapCache = new Map());
	const used = new Set();
	let arrayIndex = 0;
	return remapCollection(data, (value, indexOrKey) => {
		const positional = arrayIndex;
		let item = processor ? processor(value, indexOrKey) : value;
		let k = indexOrKey;
		if (keyFn) {
			const explicit = keyFn(value, indexOrKey);
			if (explicit !== undefined && explicit !== null) {
				k = explicit;
			}
		} else if (item && typeof item === "object" && item.$key !== undefined) {
			k = item.$key;
		}
		if (k === undefined && indexOrKey === undefined) {
			k = positional;
		}
		// Deduplicate keys so two items mapping to the same `$key` render as
		// distinct rows instead of silently collapsing.
		if (used.has(k)) {
			let n = 0;
			let fallback = `#${positional}`;
			while (used.has(fallback)) {
				fallback = `#${positional}-${n++}`;
			}
			k = fallback;
		}
		used.add(k);
		if (item !== null && typeof item === "object") {
			item = Array.isArray(item)
				? { $value: item, $key: k }
				: { ...item, $key: k };
		} else {
			item = { $: item, $key: k };
		}
		arrayIndex++;
		const at = cache.get(k);
		if (at) {
			at.data = item;
			return at;
		}
		const next = new AppliedTemplate(component, item);
		if (k != null) {
			cache.set(k, next);
		}
		return next;
	});
}

export {
	AppliedTemplate,
	appliedCollectionItems,
	appliedDataEquals,
	applyTemplate,
	copyAppliedData,
	isAppliedCollection,
	isAppliedTemplate,
	isEmptyAppliedCollection,
	mapTemplate,
};

// EOF
