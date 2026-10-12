# Native AI tools for anox-chatbot

The development image installs Codex 0.162.1 and Claude 2.1.287 with the official
curl installers. Binaries live under `/opt/zalazium-ai`; the feature applies only to development builds.
Restart checks do not download installers or inspect authentication files.

## State volume

All tool state lives in one private, root-owned volume `anox-chatbot-volume`, mounted at
`/persist`; the development user is root. `CODEX_HOME=/persist/codex` and
`CLAUDE_CONFIG_DIR=/persist/claude` (including `.claude.json`). Docker fills a new
volume from the image's private skeleton; no host variables or manual volume
creation are needed. The name survives rebuilds, branch switches and folder renames.
Codex keeps its self-updating app-server daemon under `/persist/codex/packages/`.
`check-ai.py` refuses a missing, foreign-owned or group/other-readable `/persist`.

The main container is `anox-chatbot`. A simultaneous checkout sets
`ZALAZIUM_DEV_SUFFIX=-<name>`, which selects both a separate container name and
volume `anox-chatbot-<name>-volume`; Docker refuses an occupied name instead of replacing it.
Do not have two CLI sessions write the same state concurrently.

## Migration from separate volumes

Older setups used the host variables `ANOX_CHATBOT_CODEX_VOLUME` and `ANOX_CHATBOT_CLAUDE_VOLUME`
at `/home/node/.codex` and `/home/node/.claude` with the development user node. Migrate
them on the Docker host, outside any devcontainer, with Mastermind's
`scripts/devcontainer_volume.py`: without arguments it lists devcontainers;
`<old-container> anox-chatbot-volume` previews and `--apply` stops the container and
copies the state without printing contents. It skips Codex packages and daemon runtime
records, keeps newer target state, refuses conflicts and leaves the old volumes
untouched. Then rebuild, verify both CLIs without re-login, and keep the old volumes
until a separately approved deletion. Do not commit or upload login state.

## Synthetic qualification

Run `.devcontainer/qualify.py` only as an isolated unprivileged tester on a clean
source copy with a rootless Docker daemon and `@devcontainers/cli` 0.89.0 on PATH.
Pass only the tester HOME/PATH, XDG_RUNTIME_DIR and DOCKER_HOST environment.
The checker refuses a runtime `.env`, creates an empty synthetic one, and selects a
new labelled state volume through `ZALAZIUM_DEV_SUFFIX` without using developer
authentication. It exercises the private root-owned `/persist`, native CLI versions,
initial setup, stop/start and container recreation, refusal of a conflicting checkout,
and folder rename with a persistent synthetic marker. It restores the public
configuration and removes only its own containers and labelled volumes.
Current full build/lifecycle coverage is Linux amd64; another platform needs its
own qualification. A synthetic marker does not establish real login persistence.
