.PHONY: release
release: ## Tests, publishes, tags and pushes the current package version
	@set -eu; \
	version="$(PROJECT_VERSION)"; \
	package="$$(node -p "require('./package.json').name")"; \
	test -n "$$version"; \
	echo "$$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' || { echo "[RELEASE] package version must be MAJOR.MINOR.PATCH"; exit 1; }; \
	description=$$(jj log --no-graph -r @ -T 'description.first_line()'); \
	test -n "$$description" || { echo "[RELEASE] current JJ revision has no description"; exit 1; }; \
	if jj tag list -T 'name ++ "\n"' | grep -qxF "v$$version"; then echo "[RELEASE] tag v$$version already exists; bump package.json first"; exit 1; fi; \
	if npm view "$$package@$$version" version >/dev/null 2>&1; then echo "[RELEASE] $$package@$$version is already published; bump package.json first"; exit 1; fi; \
	$(MAKE) check; \
	$(MAKE) test; \
	npm pack --dry-run; \
	npm publish --access public; \
	jj tag set "v$$version" --revision=@; \
	git push origin "v$$version"
