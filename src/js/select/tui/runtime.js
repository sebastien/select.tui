// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-10-11

// Module: select/tui/runtime
// Render-time tracking helpers backing granular updates. A port of the
// select.js `components/runtime.js` primitives the TUI needs: read-tracking of
// the data keys a behavior touches (so an unchanged behavior can be skipped on
// a granular render), plus the reactive-dependency revision snapshots used to
// invalidate a cached behavior value.
//
// TUI delta: no `runWithUIInstance` ambient-instance tracking or async render
// bookkeeping; behaviors are invoked directly, so only the proxies and
// revision helpers are shared.

import { isReactive } from "@ssebastien/select/utils/values.js";

// Function: createTrackingProxy
// Returns `[proxy, accessed]` where `proxy` forwards property reads to `data`
// and records each read key in the `accessed` set. Used to discover a
// behavior's data dependencies on its first run.
function createTrackingProxy(data) {
	const accessed = new Set();
	return [
		new Proxy(data, {
			get(target, property) {
				accessed.add(property);
				return target[property];
			},
		}),
		accessed,
	];
}

// Function: snapshotReactiveDependencyRevisions
// Maps each dependency key that holds a reactive value to its current
// `revision`, so a later render can detect that a nested reactive (cell)
// changed even when the hosting plain-object key did not.
function snapshotReactiveDependencyRevisions(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return null;
	}
	const revisions = new Map();
	for (const dep of deps) {
		const value = data[dep];
		if (isReactive(value) && Number.isFinite(value.revision)) {
			revisions.set(dep, value.revision);
		}
	}
	return revisions.size > 0 ? revisions : null;
}

// Function: hasTrackedNonReactiveObjectDeps
// True when a dependency is a plain object/array (non-reactive): its interior
// can change without any notification, so the behavior value cannot be cached
// safely and must re-run.
function hasTrackedNonReactiveObjectDeps(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return false;
	}
	for (const dep of deps) {
		const value = data[dep];
		if (
			value &&
			!isReactive(value) &&
			typeof value === "object" &&
			(value.constructor === Object || Array.isArray(value))
		) {
			return true;
		}
	}
	return false;
}

export {
	createTrackingProxy,
	hasTrackedNonReactiveObjectDeps,
	snapshotReactiveDependencyRevisions,
};

// EOF
