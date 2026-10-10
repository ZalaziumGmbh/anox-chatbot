"""Synthetic native CLI lifecycle qualification on a rootless Docker daemon."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid


def jsonc(text):
    text = re.sub(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*[\s\S]*?\*/',
                  lambda match: match.group(1) or '', text)
    return json.loads(re.sub(r',\s*([}\]])', r'\1', text))


def main():
    if os.geteuid() == 0:
        raise SystemExit('Run qualification as the isolated tester account')
    root = Path.cwd()
    path = root / '.devcontainer/devcontainer.json'
    original_root, original_path = root, path
    original = path.read_text()
    config = jsonc(original)
    nonce = uuid.uuid4().hex[:12]
    home = Path(tempfile.mkdtemp(prefix='native-qualification-'))
    volumes, containers, workspaces, made_env = [], [], [], False
    # Use only public tooling paths and the selected rootless daemon; no login state.
    env = {'HOME': str(home), 'PATH': os.environ['PATH'],
           'XDG_RUNTIME_DIR': os.environ['XDG_RUNTIME_DIR'],
           'DOCKER_HOST': os.environ['DOCKER_HOST'], 'ZALAZIUM_DEV_SUFFIX': '-qualification-' + nonce}
    def run(args, *, check=True):
        result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=1800)
        if result.returncode and check:
            print(result.stdout[-12000:])
            print(result.stderr[-12000:])
            raise RuntimeError('Synthetic qualification command failed: ' + args[0])
        return result
    def docker(*args):
        return run(['docker', *args]).stdout.strip()
    def up(*extra, refusal=None):
        result = run(['devcontainer', 'up', '--workspace-folder', str(root), '--config', str(path),
                      '--log-level', 'info', *extra], check=False)
        parsed = [json.loads(line) for line in result.stdout.splitlines()
                  if line.startswith('{') and '"outcome"' in line]
        if parsed and parsed[-1].get('containerId'):
            containers.append(parsed[-1]['containerId'])
        if refusal:
            if result.returncode == 0:
                raise RuntimeError('Expected development-container refusal was missing')
            diagnostic = (result.stdout + result.stderr).lower()
            if not all(part.lower() in diagnostic for part in refusal):
                print(result.stdout[-12000:]); print(result.stderr[-12000:])
                raise RuntimeError('Expected refusal was obscured by another failure')
            return None
        if result.returncode:
            print(result.stdout[-12000:]); print(result.stderr[-12000:])
            raise RuntimeError('Synthetic development lifecycle failed')
        if not parsed or parsed[-1].get('outcome') != 'success':
            raise RuntimeError('Development CLI did not return a successful outcome')
        identity = parsed[-1]['containerId']
        print(json.dumps({'lifecycle': 'started', 'remote_user': parsed[-1]['remoteUser']}), flush=True)
        return identity
    def verify(identity, *, seed=False):
        user = config.get('remoteUser', 'root')
        command = '''set -eu
codex --version
claude --version
command -v git
command -v ps
test "$(readlink -f "$(command -v codex)")" != "$CODEX_HOME/codex"
'''
        for state in ('CODEX_HOME', 'CLAUDE_CONFIG_DIR'):
            if seed:
                command += 'printf "%s\\n" synthetic-persistent-state > "$' + state + '/.qualification-marker"\n'
            else:
                command += 'test "$(cat "$' + state + '/.qualification-marker")" = synthetic-persistent-state\n'
        result = docker('exec', '--user', user, identity, 'sh', '-c', command)
        if 'codex-cli 0.162.1' not in result or '2.1.287 (Claude Code)' not in result:
            raise RuntimeError('Native CLI versions differ')
        print('PASS native CLI versions, development user and synthetic state', flush=True)
    try:
        if 'rootless' not in docker('info', '--format', '{{json .SecurityOptions}}'):
            raise RuntimeError('Qualification requires rootless Docker')
        (home / '.ssh').mkdir(mode=0o700)
        for name in ('github-plx', 'known_hosts'):
            (home / '.ssh' / name).touch(mode=0o600)
        (home / '.gitconfig').write_text('[user]\nname = Synthetic Qualification\nemail = qualification@example.invalid\n')
        if not (root / '.git').exists():
            run(['git', 'init'])
        if (root / '.env').exists():
            raise RuntimeError('Use a clean source copy without a runtime environment file')
        (root / '.env').touch(mode=0o600)
        made_env = True
        mounts = config.get('mounts', [])
        for mount in mounts:
            if 'type=volume' not in mount:
                continue
            source = next(part[7:] for part in mount.split(',') if part.startswith('source='))
            name = 'native-qualification-' + nonce + '-' + str(len(volumes))
            docker('volume', 'create', '--label', 'zalazium.qualification=' + nonce, name)
            volumes.append(name)
            variable = re.fullmatch(r'\$\{localEnv:([A-Z0-9_]+)\}', source)
            if variable:
                env[variable.group(1)] = name
            else:
                mounts[mounts.index(mount)] = mount.replace('source=' + source + ',', 'source=' + name + ',', 1)
        config['mounts'] = mounts
        workspace_volume = None
        if config.get('remoteUser', 'root') != 'root':
            workspace_volume = 'native-qualification-' + nonce + '-workspace'
            workspace = config.get('workspaceFolder', '/workspaces/' + root.name)
            if not workspace.startswith('/') or '${' in workspace or ',' in workspace:
                raise RuntimeError('Qualification needs a concrete workspace path')
            docker('volume', 'create', '--label', 'zalazium.qualification=' + nonce, workspace_volume)
            volumes.append(workspace_volume)
            config['workspaceFolder'] = workspace
            config['workspaceMount'] = 'source=' + workspace_volume + ',target=' + workspace + ',type=volume'
        config.setdefault('runArgs', []).extend(['--memory=2g', '--cpus=2'])
        path.write_text(json.dumps(config, indent=2) + '\n')
        codex_variable = next(name for name in env if name.endswith('_CODEX_VOLUME'))
        actual = env[codex_variable]
        env[codex_variable] = 'native-missing-' + nonce
        up(refusal=('native-missing-' + nonce, 'no such volume'))
        env[codex_variable] = actual
        if workspace_volume:
            prepared = up('--skip-post-create')
            selected = json.loads(docker('inspect', '--format', '{{json .Mounts}}', prepared))
            if not any(mount.get('Type') == 'volume' and mount.get('Name') == workspace_volume
                    and mount.get('Destination') == workspace for mount in selected):
                raise RuntimeError('Synthetic workspace volume identity differs')
            docker('cp', str(root) + '/.', prepared + ':' + workspace)
            uid = docker('exec', prepared, 'id', '-u', config['remoteUser'])
            gid = docker('exec', prepared, 'id', '-g', config['remoteUser'])
            if not uid.isdigit() or not gid.isdigit():
                raise RuntimeError('Unknown development user identity')
            docker('exec', '--user', '0', prepared, 'chown', '-R', '--no-dereference', uid + ':' + gid, workspace)
        first = up()
        verify(first, seed=True)
        docker('stop', first)
        restarted = up()
        if restarted != first:
            raise RuntimeError('A normal restart unexpectedly recreated the container')
        verify(restarted)
        recreated = up('--remove-existing-container')
        if recreated == first:
            raise RuntimeError('Rebuild did not recreate the container')
        verify(recreated)
        # A second checkout must not replace the first container or mutate its state.
        relocated = Path(tempfile.mkdtemp(prefix='native-renamed-'))
        workspaces.append(relocated)
        shutil.copytree(root, relocated / (root.name + '-renamed'), symlinks=True,
                        ignore=shutil.ignore_patterns('.git', 'node_modules', '.venv',
                                                     '__pycache__', '.next', 'dist'))
        root = relocated / (root.name + '-renamed')
        path = root / '.devcontainer/devcontainer.json'
        run(['git', 'init'])
        up(refusal=('already in use', 'qualification-' + nonce))
        if docker('inspect', '--format', '{{.State.Running}}', recreated) != 'true':
            raise RuntimeError('A conflicting checkout disturbed the existing container')
        verify(recreated)
        docker('rm', '-f', recreated)
        renamed = up()
        verify(renamed)
        print('PASS missing-volume refusal, start, restart, recreation, checkout collision and folder rename; no real login was used', flush=True)
    finally:
        for identity in reversed(list(dict.fromkeys(containers))):
            run(['docker', 'rm', '-f', identity], check=False)
        for name in volumes:
            label = run(['docker', 'volume', 'inspect', '--format', '{{index .Labels "zalazium.qualification"}}', name], check=False)
            if label.returncode == 0 and label.stdout.strip() == nonce:
                run(['docker', 'volume', 'rm', name], check=False)
        original_path.write_text(original)
        if made_env:
            (original_root / '.env').unlink(missing_ok=True)
        for workspace in workspaces:
            shutil.rmtree(workspace)
        shutil.rmtree(home)


if __name__ == '__main__':
    main()
