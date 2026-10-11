#!/usr/bin/env python3
"""Promote an exact, previously built and recovery-qualified DEV image."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

CHECKS = {'admin', 'workflow', 'persistence', 'isolated-restore', 'schema-rollback'}
# Product repository names also determine the current image repositories.
# Contract parity is checked in test_one_promotion.py before this script is copied
# into product CI. Accept legacy names until the final consumer is retired.
IMAGE_REPOSITORIES = {
    'mastermind': 'litellm',
    'anox-pro': 'anox-pro', 'anox-task': 'anox-task',
    'sales': 'anox-crm', 'anox-crm': 'anox-crm',
    'dashboard': 'anox-view', 'anox-view': 'anox-view',
    'mailbot': 'anox-mail', 'anox-mail': 'anox-mail',
    'voicebot': 'anox-voice', 'anox-voice': 'anox-voice',
    'chatbot': 'anox-chatbot', 'anox-chatbot': 'anox-chatbot',
}


def image_repository(repository):
    owner, separator, name = repository.partition('/')
    if owner != 'ZalaziumGmbh' or not separator or name not in IMAGE_REPOSITORIES:
        raise ValueError('Unregistered repository')
    return 'zalaziumcode/' + IMAGE_REPOSITORIES[name]


def validate(record, run, repository):
    target = image_repository(repository)
    workflow = ('.github/workflows/one-litellm.yaml' if repository == 'ZalaziumGmbh/mastermind'
                else '.github/workflows/deploy-zalazium-dev.yaml')
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
            or run.get('path') != workflow
            or (repository == 'ZalaziumGmbh/mastermind'
                and run.get('display_title') != 'LiteLLM qualify')):
        raise ValueError('Exact successful CI and reviewed recovery/compatibility evidence required')
    return target


def run_command(args, *, data=None):
    result = subprocess.run(args, input=data, capture_output=True, timeout=900,
        env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': os.environ['HOME']})
    if result.returncode:
        raise RuntimeError('Registry operation failed; diagnostics withheld')
    return result.stdout


def main():
    repository = os.environ['GITHUB_REPOSITORY']
    record_path = ('infrastructure/zalazium-one/litellm/release.json'
                   if repository == 'ZalaziumGmbh/mastermind' else '.github/one-release.json')
    record = json.loads(Path(record_path).read_text())
    image_repository(repository)
    req = urllib.request.Request('https://api.github.com/repos/' + repository + '/actions/runs/' + str(record['run_id']),
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        run = json.load(response)
    target = validate(record, run, repository)
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
        if (metadata['Digest'] != record['digest']
                or metadata.get('Labels', {}).get('org.opencontainers.image.revision') != record['revision']):
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


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
        print('Channel promotion refused; review public release record and CI metadata', file=sys.stderr)
        sys.exit(1)
