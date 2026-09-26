// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/applied
// Keyed applied-template wrappers returned by `Component.map` and the mapping
// helper that produces them. An `AppliedTemplate` is bound to a component and
// carries a data bag with a stable `$key`; `TUIInstance` renders each one as a
// reconciled child instance.
//
// Concepts:
// - *applied template*: `{ template, data }` wrapper with `$key` on `data`.
// - *map cache*: per-component `Map` keyed by `$key`, keeping wrapper identity
//   stable across renders.

import { normalizeCollection, resolvePath } from "./collections.js";

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
// True when `value` is an `AppliedTemplate` produced by `Component.map`.
function isAppliedTemplate(value) {
	return value instanceof AppliedTemplate;
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

// Function: mapTemplate
// Maps a collection through a component into keyed applied-template wrappers.
// A focused port of select.js `Component.map(data, processor?, key?)`: it
// always returns a flat array (not a Map/Set/object-shaped container) because
// the result is consumed as a list by an `out` slot.
function mapTemplate(component, data, processor, key) {
	const entries = normalizeCollection(data);
	const keyFn =
		key == null
			? null
			: typeof key === "function"
				? key
				: (value) => resolvePath(value, key);
	const cache = component._mapCache ?? (component._mapCache = new Map());
	const result = new Array(entries.length);
	const used = new Set();
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		let item = processor ? processor(entry.value, entry.index) : entry.value;
		let k = entry.mapKey !== undefined ? entry.mapKey : entry.index;
		if (keyFn) {
			const explicit = keyFn(entry.value, entry.index);
			if (explicit !== undefined && explicit !== null) {
				k = explicit;
			}
		} else if (item && typeof item === "object" && item.$key !== undefined) {
			k = item.$key;
		}
		// Deduplicate keys so two items mapping to the same `$key` render as
		// distinct rows instead of silently collapsing, matching `each`.
		if (used.has(k)) {
			let n = 0;
			let fallback = `#${i}`;
			while (used.has(fallback)) {
				fallback = `#${i}-${n++}`;
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
		let at = cache.get(k);
		if (at) {
			at.data = item;
		} else {
			at = new AppliedTemplate(component, item);
			cache.set(k, at);
		}
		result[i] = at;
	}
	return result;
}

export { AppliedTemplate, appliedDataEquals, isAppliedTemplate, mapTemplate };

// EOF
