.PHONY: prd rollback

# Release main's tested :latest image to PRD; watchtower deploys it within five minutes.
prd:
	@git fetch -q origin main && git tag -f prd FETCH_HEAD >/dev/null
	@git push -q origin :refs/tags/prd 2>/dev/null || true
	@git push -q origin prd
	@echo "PRD release of $$(git rev-parse --short prd) started; see GitHub Actions (release)."

# Return PRD to the previous release; repeating it changes nothing.
rollback:
	@git fetch -q origin main && git tag -f rollback FETCH_HEAD >/dev/null
	@git push -q origin :refs/tags/rollback 2>/dev/null || true
	@git push -q origin rollback
	@echo "PRD rollback started; see GitHub Actions (release)."
