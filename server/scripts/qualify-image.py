"""Synthetic HTTP admin and persistence test of the actual rootless image."""
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request


def main(image):
    if os.getuid() == 0:
        raise RuntimeError('Run qualification as tester')
    def docker(*args):
        result = subprocess.run(['docker', *args], capture_output=True, text=True)
        if result.returncode:
            error = result.stderr
            for argument in args:
                if '=' in argument:
                    error = error.replace(argument.split('=', 1)[1], '<test-field>')
            raise RuntimeError('Synthetic Docker operation failed: ' + error[-2000:])
        return result.stdout.strip()
    if not any('rootless' in item for item in json.loads(docker('info', '--format', '{{json .SecurityOptions}}'))):
        raise RuntimeError('Rootless Docker required')
    name = 'one-chatbot-' + secrets.token_hex(4)
    volume = name + '-data'
    password, rotated = 'Aa1!' + secrets.token_urlsafe(24), 'Bb2!' + secrets.token_urlsafe(24)
    fields = {key: secrets.token_urlsafe(32) for key in ('JWT_SECRET', 'SIG_KEY', 'SIG_SALT', 'LITE_LLM_API_KEY')}
    fields.update(MANAGED_RUNTIME='true', ADMIN_EMAIL='zalazium@zalazium.de',
                  ADMIN_PASSWORD=password, DISABLE_TELEMETRY='true', CHECKPOINT_DISABLE='1',
                  STORAGE_DIR='/app/server/storage', COMKEY_DIR='/tmp/comkey',
                  LLM_PROVIDER='litellm', LITE_LLM_BASE_PATH='http://127.0.0.1:1/v1',
                  LITE_LLM_MODEL_PREF='synthetic-model', EMBEDDING_ENGINE='native', VECTOR_DB='lancedb')
    def request(path, body=None, token=None):
        req = urllib.request.Request('http://127.0.0.1:18301/api' + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as response:
            return response.code, None
    def start():
        args = ['run', '-d', '--name', name, '--memory', '3g', '-p', '127.0.0.1:18301:3001',
                '--mount', 'type=volume,src=' + volume + ',dst=/app/server/storage,volume-nocopy', '--tmpfs', '/tmp:rw,uid=1000,gid=1000,mode=1777']
        for key, value in fields.items():
            args += ['-e', key + '=' + value]
        docker(*args, image)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            if docker('inspect', '--format', '{{.State.Running}}', name) != 'true':
                raise RuntimeError('Synthetic chatbot exited before readiness')
            try:
                if request('/ping')[0] == 200:
                    return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise RuntimeError('Synthetic chatbot readiness deadline exceeded')
    def login(value):
        status, data = request('/request-token', {'username': fields['ADMIN_EMAIL'], 'password': value})
        assert status == 200
        return data
    docker('volume', 'create', volume)
    docker('run', '--rm', '--user', '0', '--entrypoint', 'chown',
           '--mount', 'type=volume,src=' + volume + ',dst=/app/server/storage,volume-nocopy',
           image, '1000:1000', '/app/server/storage')
    try:
        start()
        assert request('/admin/users')[0] in (401, 403)
        assert request('/system/enable-multi-user', {'username': 'outsider', 'password': password})[0] in (401, 403)
        session = login(password)
        assert session['valid'] and session['user']['role'] == 'admin'
        token = session['token']
        assert request('/admin/users', token=token)[0] == 200
        status, created = request('/workspace/new', {'name': 'Synthetic qualification'}, token)
        assert status == 200 and created['workspace']
        slug = created['workspace']['slug']
        status, other = request('/admin/users/new', {'username': 'synthetic-user', 'password': password,
                                                    'role': 'default'}, token)
        assert status == 200 and other['user']
        assert request('/admin/user/' + str(session['user']['id']), {'password': rotated}, token)[1]['success']
        assert not login(password)['valid']
        assert '/app/server/.env' not in docker('diff', name), 'Runtime credentials were persisted'
        docker('stop', '--time', '60', name)
        assert docker('inspect', '--format', '{{.State.ExitCode}}', name) == '0', 'Managed image did not stop cleanly'
        docker('rm', name)
        fields['JWT_SECRET'] = secrets.token_urlsafe(32)
        start()
        assert request('/admin/users', token=token)[0] in (401, 403)
        assert not login(password)['valid']
        session = login(rotated)
        assert session['valid'] and session['user']['role'] == 'admin'
        assert request('/workspace/' + slug, token=session['token'])[0] == 200
        assert '/app/server/.env' not in docker('diff', name)
        print('PASS chatbot admin, closed onboarding, persistent workspace, rotation and session revocation')
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True)


if __name__ == '__main__':
    main(sys.argv[1])
