#!/usr/bin/env python3
"""Promote an exact, previously built and recovery-qualified DEV image."""
import json
import base64
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

CHECKS = {'admin', 'workflow', 'persistence', 'isolated-restore', 'schema-rollback'}
# GitHub names may change; immutable images and retained recovery points do not.
# Contract parity is checked in test_one_promotion.py before this script is copied
# into product CI. Accept legacy names until the final consumer is retired.
IMAGE_REPOSITORIES = {
    'anox-pro': 'anox-pro', 'anox-task': 'anox-task', 'litellm': 'litellm',
    'sales': 'sales', 'anox-crm': 'sales',
    'dashboard': 'dashboard', 'anox-view': 'dashboard',
    'mailbot': 'mailbot', 'anox-mail': 'mailbot',
    'voicebot': 'voicebot', 'anox-voice': 'voicebot',
    'chatbot': 'chatbot', 'anox-chatbot': 'chatbot',
}


def image_repository(repository):
    owner, separator, name = repository.partition('/')
    if owner != 'ZalaziumGmbh' or not separator or name not in IMAGE_REPOSITORIES:
        raise ValueError('Unregistered repository')
    return 'zalaziumcode/' + IMAGE_REPOSITORIES[name]


def validate(record, run, repository):
    target = image_repository(repository)
    if (set(record) != {'revision', 'run_id', 'digest', 'previous_digest', 'backup_id', 'checks', 'evidence'}
            or not re.fullmatch(r'[a-f0-9]{40}', record['revision'])
            or type(record['run_id']) is not int
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', record['digest'])
            or (record['previous_digest'] is not None and not re.fullmatch(r'sha256:[a-f0-9]{64}', record['previous_digest']))
            or not re.fullmatch(r'[a-f0-9]{64}', record['backup_id'])
            or set(record['checks']) != CHECKS
            or not record['evidence'].startswith('https://github.com/ZalaziumGmbh/mastermind/')
            or run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('head_sha') != record['revision']
            or run.get('path') != '.github/workflows/deploy-zalazium-dev.yaml'):
        raise ValueError('Exact successful CI and reviewed recovery/compatibility evidence required')
    return target


def run_command(args, *, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=900,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': os.environ['HOME']})
    if result.returncode:
        raise RuntimeError('Registry operation failed; diagnostics withheld')
    return result.stdout


def main():
    record = json.loads(Path('.github/one-release.json').read_text())
    repository = os.environ['GITHUB_REPOSITORY']
    image_repository(repository)
    req = urllib.request.Request('https://api.github.com/repos/' + repository + '/actions/runs/' + str(record['run_id']),
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        run = json.load(response)
    target = validate(record, run, repository)
    if repository == 'ZalaziumGmbh/litellm':
        request = urllib.request.Request('https://api.github.com/repos/' + repository
            + '/contents/.github/one-official-image.txt?ref=' + record['revision'],
            headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
        with urllib.request.urlopen(request, timeout=30) as response:
            official = base64.b64decode(json.load(response)['content']).decode().strip()
        if official != 'docker.litellm.ai/berriai/litellm@' + record['digest']:
            raise ValueError('Official image differs from the exact CI-tested upstream digest')
    if sys.argv[1:] == ['--verify']:
        print('Reviewed immutable release and successful build verified')
        return
    if sys.argv[1:] != ['--publish']:
        raise ValueError('Select verify or publish')
    # Credentials exist only in this publication step and protected RAM. No
    # application code, builds or tests execute with the registry environment.
    with tempfile.TemporaryDirectory(prefix='one-registry-', dir='/dev/shm/zalazium') as temporary:
        auth = str(Path(temporary) / 'auth.json')
        run_command(['skopeo', 'login', '--authfile', auth, '--username', os.environ['REGISTRY_USER'],
                     '--password-stdin', 'docker.io'], data=os.environ['REGISTRY_PASSWORD'].encode())
        def inspect(reference):
            return json.loads(run_command(['skopeo', 'inspect', '--authfile', auth, 'docker://' + reference]))
        source = target + '@' + record['digest']
        metadata = inspect(source)
        if metadata['Digest'] != record['digest'] or (image_repo_requires_revision(repository)
                and metadata.get('Labels', {}).get('org.opencontainers.image.revision') != record['revision']):
            raise ValueError('Published candidate differs from qualified revision')
        channel = target + ':zalazium-one-dev'
        # An absent initial channel is admitted only when the registry expressly
        # reports a missing manifest, never on authentication/network failures.
        previous = subprocess.run(['skopeo', 'inspect', '--authfile', auth, 'docker://' + channel],
            capture_output=True, timeout=90, env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': os.environ['HOME']})
        if previous.returncode:
            if record['previous_digest'] is not None or b'manifest unknown' not in previous.stderr.lower():
                raise RuntimeError('Previous channel could not be verified')
        else:
            digest = json.loads(previous.stdout)['Digest']
            if digest == record['digest']:
                print('Qualified channel already matches; no mutation')
                return
            if digest != record['previous_digest']:
                raise RuntimeError('Channel moved since qualification; re-review required')
        run_command(['skopeo', 'copy', '--all', '--preserve-digests', '--src-authfile', auth,
            '--dest-authfile', auth, 'docker://' + source, 'docker://' + channel])
        if inspect(channel)['Digest'] != record['digest']:
            raise RuntimeError('Promoted channel verification failed')
        print('Exact qualified image promoted; legacy DEV and production tags unchanged')


def image_repo_requires_revision(repository):
    # The official LiteLLM image is mirrored byte-for-byte, never relabelled or
    # rebuilt from the old fork. Its CI commit pins the exact upstream digest.
    return repository != 'ZalaziumGmbh/litellm'


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
        print('Channel promotion refused; review public release record and CI metadata', file=sys.stderr)
        sys.exit(1)
