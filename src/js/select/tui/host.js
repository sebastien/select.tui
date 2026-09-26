// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/host
// Renderer lifecycle: `render` and `testRender` for OpenTUI.
// TUI-only (no select.js counterpart): owns or reuses a CLI renderer,
// mounts the instance, and disposes on renderer destroy.

import { createCliRenderer } from "@opentui/core";
import { isAppliedTemplate } from "./applied.js";

// Function: isCliRenderer
// True when `value` looks like an owned OpenTUI CLI renderer.
function isCliRenderer(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		value.root &&
		typeof value.root.add === "function" &&
		value.keyInput
	);
}

// Function: render
// Mounts a template component (or an applied `Component(data)` wrapper) onto
// a new or existing CLI renderer and returns the instance. Owned renderers
// are destroyed via `instance.quit()`; external renderers are left alive.
async function render(Component, rendererOrConfig) {
	const existing = isCliRenderer(rendererOrConfig);
	const renderer = existing
		? rendererOrConfig
		: await createCliRenderer({
				exitOnCtrlC: true,
				...(rendererOrConfig && typeof rendererOrConfig === "object"
					? rendererOrConfig
					: null),
			});
	try {
		// Accept a template component (`ui(source)`) or an applied wrapper
		// (`Component(data)`), mirroring select.js where the callable returns
		// a wrapper. Wrappers mount via their template with the wrapper data.
		const instance = isAppliedTemplate(Component)
			? Component.template.new(null, { data: Component.data })
			: Component.new();
		if (!existing) {
			instance._ownedRenderer = renderer;
		}
		instance.mount(renderer.root);
		renderer.once("destroy", () => instance.dispose());
		return instance;
	} catch (error) {
		if (!existing && !renderer.isDestroyed) {
			renderer.destroy();
		}
		throw error;
	}
}

// Function: testRender
// Mounts onto an OpenTUI test renderer; returns the setup plus `instance`.
// Accepts a component or an applied wrapper; explicit `{ data }` overrides
// wrapper data.
async function testRender(Component, options = {}) {
	const { data, ...testOptions } = options;
	// Imported lazily so the production entry does not pull in the test helpers.
	const { createTestRenderer } = await import("@opentui/core/testing");
	const setup = await createTestRenderer({
		height: 10,
		width: 40,
		...testOptions,
	});
	try {
		const instance = isAppliedTemplate(Component)
			? Component.template.new(
					null,
					data !== undefined ? { data } : { data: Component.data },
				)
			: Component.new(null, data !== undefined ? { data } : undefined);
		instance.mount(setup.renderer.root);
		setup.renderer.once("destroy", () => instance.dispose());
		return Object.assign(setup, { instance });
	} catch (error) {
		if (!setup.renderer.isDestroyed) {
			setup.renderer.destroy();
		}
		throw error;
	}
}

export { render, testRender };

// EOF
