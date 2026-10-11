"""Check native CLIs and persistent state without printing login contents."""
import os
from pathlib import Path
import re
import subprocess
import tomllib

for tool in ("codex", "claude"):
    subprocess.run([tool, "--version"], check=True)
for name in ("CODEX_HOME", "CLAUDE_CONFIG_DIR"):
    folder = Path(os.environ[name])
    if not folder.is_dir() or not os.access(folder, os.W_OK):
        raise SystemExit("AI state volume is absent or not writable: " + name)
# File storage survives container recreation. Keep all other configuration intact.
config = Path(os.environ["CODEX_HOME"]) / "config.toml"
try:
    original = config.read_text() if config.exists() else ""
    settings = tomllib.loads(original)
except (OSError, tomllib.TOMLDecodeError):
    raise SystemExit("Existing Codex configuration is unreadable or invalid; preserved unchanged") from None
if settings.get("cli_auth_credentials_store") != "file":
    lines = original.splitlines(keepends=True)
    found = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith("["):
            break
        if re.match(r"^\s*cli_auth_credentials_store\s*=", line):
            lines[i] = 'cli_auth_credentials_store = "file"\n'
            found = True
            break
    updated = "".join(lines)
    if not found:
        updated = 'cli_auth_credentials_store = "file"\n' + updated
    assert tomllib.loads(updated)["cli_auth_credentials_store"] == "file"
    temporary = config.with_name(".config.toml.consolidation")
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(updated)
        temporary.replace(config)
    finally:
        temporary.unlink(missing_ok=True)
print("Native CLI versions and persistent state paths verified; no login data inspected")
