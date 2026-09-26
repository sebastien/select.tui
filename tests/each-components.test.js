import { afterAll, describe, expect, test } from "bun:test"
import { cell } from "select/state/cells"
import { extend, testRender, ui } from "../src/js/select/tui/index.js"

describe("each", () => {
	const List = ui(`
		<box flexDirection="column">
			<box each="items" each:key="name" flexDirection="row">
				<text out="rowLabel" width="12"></text>
				<text out="rowCount" width="6"></text>
			</box>
		</box>
	`)
		.init(() => ({
			items: cell([
				{ name: "alpha", count: 1 },
				{ name: "beta", count: 2 },
			]),
		}))
		.does({
			rowCount: (_self, data) => `${data.item.count}`,
			rowLabel: (_self, data) => data.item.name,
		})

	test("renders one row per item", async () => {
		const setup = await testRender(List, { width: 24, height: 6 })
		try {
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("alpha")
			expect(frame).toContain("beta")
			expect(frame).toContain("2")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("reconciles adds, removals and reorder by key", async () => {
		const setup = await testRender(List, { width: 24, height: 6 })
		try {
			await setup.renderOnce()
			setup.instance.data.items.set([
				{ name: "beta", count: 2 },
				{ name: "gamma", count: 3 },
				{ name: "alpha", count: 1 },
			])
			await Promise.resolve()
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("gamma")
			expect(frame).toContain("3")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("clears rows when the collection empties", async () => {
		const setup = await testRender(List, { width: 24, height: 6 })
		try {
			await setup.renderOnce()
			setup.instance.data.items.set([])
			await Promise.resolve()
			await setup.renderOnce()
			expect(setup.captureCharFrame()).not.toContain("alpha")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("click publishes scoped payload to the parent", async () => {
		let received = null
		const App = ui(`
			<box flexDirection="column">
				<box each="items" on:click="item.name!Pick">
					<text out="rowLabel"></text>
				</box>
			</box>
		`)
			.init(() => ({ items: cell([{ name: "alpha" }, { name: "beta" }]) }))
			.does({
				Pick: (_self, payload) => {
					received = payload
				},
				rowLabel: (_self, data) => data.item.name,
			})
		const setup = await testRender(App, { width: 20, height: 4, useMouse: true })
		try {
			await setup.renderOnce()
			await setup.mockMouse.click(1, 0)
			await setup.renderOnce()
			expect(received).toBe("alpha")
		} finally {
			setup.renderer.destroy()
		}
	})
})

describe("component tags", () => {
	const Greeting = ui(`
		<box flexDirection="column">
			<text out="line"></text>
		</box>
	`)
		.init((self, data) => ({ ...data, extra: cell("!") }))
		.does({
			line: (_self, data) => {
				const who = data.who?.isReactive ? data.who.value : data.who
				return `hi ${who ?? "?"}${data.extra.value}`
			},
		})

	test("renders a nested instance with in: data", async () => {
		extend({ greeting: Greeting })
		const App = ui(`
			<box flexDirection="column">
				<greeting in:who="name" width="20" height="2" />
			</box>
		`).init(() => ({ name: cell("ada") }))
		const setup = await testRender(App, { width: 20, height: 4, useMouse: true })
		try {
			await setup.renderOnce()
			expect(setup.captureCharFrame()).toContain("hi ada!")
		} finally {
			setup.renderer.destroy()
		}
	})

	test("child pub bubbles to the parent behavior", async () => {
		extend({ greeting2: Greeting })
		let seen = null
		const Inner = ui(`<box><text on:click="!Hello" out="msg"></text></box>`).does({
			Hello: (self) => self.pub("greet", "ping"),
			msg: () => "click me",
		})
		const App = ui(`
			<box>
				<inner2 />
			</box>
		`).does({
			greet: (_self, payload) => {
				seen = payload
			},
		})
		extend({ inner2: Inner })
		const setup = await testRender(App, { width: 20, height: 4, useMouse: true })
		try {
			await setup.renderOnce()
			await setup.mockMouse.click(1, 0)
			await setup.renderOnce()
			expect(seen).toBe("ping")
		} finally {
			setup.renderer.destroy()
		}
	})
})

describe("scrollbox tag", () => {
	test("renders children in a scrollable box", async () => {
		const Box = ui(`
			<scrollbox height="3" width="10">
				<text>one</text>
				<text>two</text>
			</scrollbox>
		`)
		const setup = await testRender(Box, { width: 12, height: 5 })
		try {
			await setup.renderOnce()
			const frame = setup.captureCharFrame()
			expect(frame).toContain("one")
		} finally {
			setup.renderer.destroy()
		}
	})
})

afterAll(() => {
	extend({ greeting: null, greeting2: null, inner2: null })
})
