import { describe, expect, test } from "bun:test";
import { cell, unwrap } from "select/state/cells";
import { testRender, ui } from "../src/js/select/tui/index.js";

const Login = ui(`
	<box border padding="2" flexDirection="column" gap="1">
		<text fg="#FFFF00">Login Form</text>
		<box title="Username" border width="40" height="3">
			<input inout="username" placeholder="Enter username..."
			       out:focused="focusedUser" on:enter="submit" />
		</box>
		<box title="Password" border width="40" height="3">
			<input inout="password" placeholder="Enter password..."
			       out:focused="focusedPass" on:enter="submit" />
		</box>
		<text out="status" out:fg="statusFg"></text>
	</box>
`)
	.init(() => ({
		focused: cell("user"),
		password: cell(""),
		status: cell("idle"),
		username: cell(""),
	}))
	.does({
		focusedPass: (_self, { focused }) => unwrap(focused) === "pass",
		focusedUser: (_self, { focused }) => unwrap(focused) === "user",
		status: (_self, { status }) => `${unwrap(status) ?? "idle"}`.toUpperCase(),
		statusFg: (_self, { status }) =>
			unwrap(status) === "success"
				? "green"
				: unwrap(status) === "error"
					? "red"
					: "#999",
	})
	.sub("submit", (self, data) => {
		const username = unwrap(data.username);
		const password = unwrap(data.password);
		self.update({
			status:
				username === "admin" && password === "secret" ? "success" : "error",
		});
	});

describe("login", () => {
	test("shows idle status and submits", async () => {
		const setup = await testRender(Login, { width: 44, height: 14 });
		try {
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("Login Form");
			expect(setup.captureCharFrame()).toContain("IDLE");

			setup.instance.data.username.set("admin");
			setup.instance.data.password.set("secret");
			await Promise.resolve();
			setup.instance.pub("submit");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("SUCCESS");

			setup.instance.data.password.set("nope");
			await Promise.resolve();
			setup.instance.pub("submit");
			await Promise.resolve();
			await setup.renderOnce();
			expect(setup.captureCharFrame()).toContain("ERROR");
		} finally {
			setup.renderer.destroy();
		}
	});
});
