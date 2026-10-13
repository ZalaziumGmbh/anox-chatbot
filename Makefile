.PHONY: prd

# Release the tested :latest image to PRD; rollback: gh workflow run release.yaml -f action=rollback
prd:
	gh workflow run release.yaml -f action=release
	@echo "PRD release started: gh run list --workflow release.yaml"
