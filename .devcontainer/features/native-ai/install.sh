#!/usr/bin/env bash
# Development-image build only; never run against a developer's login directory.
set -euo pipefail
codex_version=0.162.1
claude_version=2.1.287
install_dir=/opt/zalazium-ai
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates python3 libatomic1 libstdc++6 git openssh-client procps
rm -rf /var/lib/apt/lists/*
mkdir -p "$install_dir"
curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 120     https://chatgpt.com/codex/install.sh -o "$stage/codex-install.sh"
curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 120     https://claude.ai/install.sh -o "$stage/claude-install.sh"
# Install with a fresh build-only home, without inherited provider credentials.
env -i HOME="$stage" PATH=/usr/local/bin:/usr/bin:/bin CODEX_NON_INTERACTIVE=1     sh "$stage/codex-install.sh" --release "$codex_version"
env -i HOME="$stage" PATH=/usr/local/bin:/usr/bin:/bin     bash "$stage/claude-install.sh" "$claude_version"
cp -a "$(readlink -f "$stage/.codex/packages/standalone/current")" "$install_dir/codex"
if test -x "$install_dir/codex/bin/codex"; then
    ln -s "$install_dir/codex/bin/codex" /usr/local/bin/codex
else
    ln -s "$install_dir/codex/codex" /usr/local/bin/codex
fi
install -m 0755 "$(readlink -f "$stage/.local/bin/claude")" "$install_dir/claude"
ln -s "$install_dir/claude" /usr/local/bin/claude
test "$(codex --version)" = "codex-cli $codex_version"
claude --version | grep -F "$claude_version" >/dev/null
# Docker copies these empty directories and their ownership into new volumes.
for directory in "${_REMOTE_USER_HOME}/.codex" "${_REMOTE_USER_HOME}/.claude"; do
    install -d -m 0700 -o "${_REMOTE_USER}" -g "$(id -gn "${_REMOTE_USER}")" "$directory"
done
