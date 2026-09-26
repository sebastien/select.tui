import { cell } from "select/state/cells";
import { render, ui } from "../src/js/select/tui/index.js";

const Login = ui(`
	<box border padding="2" flexDirection="column" gap="1" on:keypress="keys">
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
		focusedPass: (_self, { focused }) => focused === "pass",
		focusedUser: (_self, { focused }) => focused === "user",
		keys: (self, { focused }, key) => {
			if (key.name === "tab") {
				self.update({ focused: focused === "user" ? "pass" : "user" });
			}
		},
		status: (_self, { status }) => `${status ?? "idle"}`.toUpperCase(),
		statusFg: (_self, { status }) =>
			status === "success"
				? "green"
				: status === "error"
					? "red"
					: "#999",
		submit: (self, { username, password }) => {
			self.update({
				status:
					username === "admin" && password === "secret" ? "success" : "error",
			});
		},
	});

await render(Login);
