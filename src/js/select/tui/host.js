// Project: Select.tui
// Author:  Sebastien Pierre
// License: BSD
// Created: 2026-08-31

// Module: select/tui/host
// Renderer lifecycle: `render` and `testRender`.

import { createCliRenderer } from "@opentui/core";

function isCliRenderer(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		value.root &&
		typeof value.root.add === "function" &&
		value.keyInput
	);
}

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
		const instance = Component.new();
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
		const instance = Component.new(
			null,
			data !== undefined ? { data } : undefined,
		);
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
