.DEFAULT_GOAL := help
.PHONY: help
help:
	@printf "make dev: deploy the tested commit to DEV\nmake prd: promote the healthy DEV image to PRD\n"

# Same product release from a manual container terminal or Commander.
INFRA ?= $(if $(COMMANDER_HOME),$(COMMANDER_HOME)/workspaces/zalazium/infrastructure,../infrastructure)
.PHONY: dev prd
dev prd:
	@if command -v commander-make >/dev/null 2>&1; then commander-make $@; \
	else bash "$(INFRA)/scripts/product-release" "$@" anox-chatbot; fi
