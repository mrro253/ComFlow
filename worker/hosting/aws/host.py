#!/usr/bin/env python3
"""Gated host operations. No provisioning, formatting, imports or login retries."""
import argparse
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import tempfile
from datetime import datetime, timezone

CONFIG = Path('/etc/comflow')
STATE = Path('/var/lib/comflow-state')
RUN = Path('/run/comflow')
LETSENCRYPT = Path('/etc/letsencrypt')
PROJECT = 'comflow-staging-worker'


class DeploymentError(ValueError):
    """Only static, explicitly safe operator messages are reported."""


def require(ok, message='Deployment validation failed'):
    if not ok:
        raise DeploymentError(message)


def command(args, *, data=None):
    # Never print commands, stderr, raw AWS output, credentials or request bodies.
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=90, check=False)
    require(result.returncode == 0, 'Host operation failed; private output withheld')
    return result.stdout


def protected_json(path):
    info = path.lstat()
    require(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o077 == 0, 'Configuration must be a root-owned private file')
    return json.loads(path.read_text())


def validate(c):
    fields = {'region', 'accountId', 'deploymentId', 'hostname', 'stateFilesystemUuid', 'secretArn', 'secretVersionId', 'workerImage', 'gatewayImage', 'supabaseUrl', 'seccompSha256'}
    require(set(c) == fields and all(isinstance(v, str) for v in c.values()), 'Unexpected deployment settings')
    require(c['region'] == 'us-east-2' and re.fullmatch(r'\d{12}', c['accountId']))
    require(c['deploymentId'] == PROJECT)
    require(re.fullmatch(r'verify-staging\.[a-z0-9][a-z0-9.-]+\.[a-z]{2,}', c['hostname']))
    require(not any(c['hostname'].endswith(suffix) for suffix in ('.example.com', '.invalid', '.test')), 'Choose an owned live domain first')
    require(re.fullmatch(r'[a-fA-F0-9-]{20,40}', c['stateFilesystemUuid']), 'Reviewed state filesystem UUID required')
    require(re.fullmatch(r'arn:aws:secretsmanager:us-east-2:' + c['accountId'] + r':secret:[A-Za-z0-9/_+=.@-]+', c['secretArn']))
    require(re.fullmatch(r'[A-Za-z0-9-]{32,64}', c['secretVersionId']), 'Pin the approved secret version')
    require(re.fullmatch(r'[a-f0-9]{64}', c['seccompSha256']))
    prefix = c['accountId'] + '.dkr.ecr.us-east-2.amazonaws.com/'
    for key in ('workerImage', 'gatewayImage'):
        require(c[key].startswith(prefix) and re.fullmatch(re.escape(prefix) + r'[a-z0-9._/-]+@sha256:[a-f0-9]{64}', c[key]), 'Use approved private ECR digest references')
    require(re.fullmatch(r'https://[a-z0-9]{20}\.supabase\.co', c['supabaseUrl']))
    return c


def fingerprint(c):
    return hashlib.sha256(json.dumps(c, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def approval(c):
    a = protected_json(CONFIG / 'live-approval.json')
    require(all(a.get(k) is True for k in ('approvedForLive', 'localWorkerStopped', 'noActiveSync', 'queuedWritesReviewed')), 'Live cutover approval is required')
    require(a.get('configSha256') == fingerprint(c), 'Approval does not match this release')
    expiry = datetime.fromisoformat(a['expiresAt'].replace('Z', '+00:00'))
    seconds = (expiry - datetime.now(timezone.utc)).total_seconds()
    require(0 < seconds <= 3600, 'Live approval is expired or too long-lived')


def active(c):
    require(protected_json(CONFIG / 'active-release.json').get('configSha256') == fingerprint(c), 'No matching activated release')


def state_mount(c):
    command(['mountpoint', '-q', str(STATE)])
    require(command(['findmnt', '-n', '-o', 'UUID', '--target', str(STATE)]).strip() == c['stateFilesystemUuid'], 'Wrong or missing state volume; no automatic initialization')


def security_profile(c):
    path = CONFIG / 'seccomp-playwright.json'
    info = path.lstat()
    require(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o022 == 0)
    require(hashlib.sha256(path.read_bytes()).hexdigest() == c['seccompSha256'], 'Browser security profile changed')


def private_directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o077 == 0, 'Unsafe private runtime directory')


def atomic(path, text):
    private_directory(path.parent)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def certificate(directory, hostname):
    for filename in ('fullchain.pem', 'privkey.pem'):
        item = directory / filename
        mask = 0o027 if filename == 'privkey.pem' else 0o022
        require(item.is_file() and not item.is_symlink() and item.stat().st_uid == 0 and item.stat().st_mode & mask == 0, 'Unsafe certificate permissions')
    # Load key/certificate as a pair, then validate the publicly trusted chain and name.
    ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(str(directory / 'fullchain.pem'), str(directory / 'privkey.pem'))
    command(['openssl', 'x509', '-in', str(directory / 'fullchain.pem'), '-checkend', str(21 * 86400), '-noout'])
    command(['openssl', 'verify', '-verify_hostname', hostname, '-CAfile', '/etc/ssl/certs/ca-certificates.crt', '-untrusted', str(directory / 'fullchain.pem'), str(directory / 'fullchain.pem')])


def compose(c):
    worker = {
        'image': c['workerImage'], 'hostname': PROJECT, 'init': True, 'read_only': True,
        'restart': 'unless-stopped', 'stop_grace_period': '35s', 'cap_drop': ['ALL'],
        'security_opt': ['no-new-privileges:true', 'seccomp=' + str(CONFIG / 'seccomp-playwright.json')],
        'shm_size': '512m', 'mem_limit': '2g', 'cpus': 2,
        'tmpfs': ['/tmp:rw,nosuid,size=256m'],
        'ports': ['443:8443'],
        'volumes': [str(STATE / 'worker') + ':/state'],
        'env_file': [str(RUN / 'worker.env')],
        'environment': {'CARRIER_BROWSER_MODE': 'hosted', 'HOSTED_VERIFICATION_ENABLED': 'true', 'SCHEDULED_SYNC_ENABLED': 'false', 'LOCALAPPDATA': '/state'},
        'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
    }
    gateway = {
        'image': c['gatewayImage'], 'network_mode': 'service:worker', 'user': '1001:1001',
        'read_only': True, 'restart': 'unless-stopped', 'stop_grace_period': '10s',
        'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'], 'mem_limit': '128m',
        'tmpfs': ['/tmp:rw,nosuid,size=16m'],
        'volumes': [str(STATE / 'tls') + ':/tls:ro'],
        'environment': {'GATEWAY_TLS_CERT': '/tls/current/fullchain.pem', 'GATEWAY_TLS_KEY': '/tls/current/privkey.pem'},
        'depends_on': ['worker'], 'logging': worker['logging'],
    }
    return {'services': {'worker': worker, 'gateway': gateway}}


def docker(*args):
    return command(['docker', 'compose', '-p', PROJECT, '-f', str(RUN / 'compose.json'), *args])


def secrets(c):
    raw = command(['aws', '--region', c['region'], 'secretsmanager', 'get-secret-value', '--secret-id', c['secretArn'], '--version-id', c['secretVersionId'], '--output', 'json'])
    envelope = json.loads(raw)
    require(envelope.get('VersionId') == c['secretVersionId'], 'Runtime secret version changed')
    secret = json.loads(envelope['SecretString'])
    expected = {'SUPABASE_SERVICE_ROLE_KEY', 'CREDENTIAL_ENCRYPTION_KEY', 'WORKER_VERIFICATION_KEY'}
    require(set(secret) == expected, 'Runtime secret is incomplete')
    require(isinstance(secret['SUPABASE_SERVICE_ROLE_KEY'], str) and re.fullmatch(r'[A-Za-z0-9._=-]{20,4096}', secret['SUPABASE_SERVICE_ROLE_KEY']))
    for key in expected - {'SUPABASE_SERVICE_ROLE_KEY'}:
        require(isinstance(secret[key], str) and len(base64.b64decode(secret[key], validate=True)) == 32, 'Invalid encryption/verification key')
    return 'NEXT_PUBLIC_SUPABASE_URL=' + c['supabaseUrl'] + '\n' + ''.join(key + '=' + secret[key] + '\n' for key in sorted(expected))


def login_registry(c):
    password = command(['aws', '--region', c['region'], 'ecr', 'get-login-password']).strip()
    require(password and '\n' not in password)
    command(['docker', 'login', '--username', 'AWS', '--password-stdin', c['accountId'] + '.dkr.ecr.us-east-2.amazonaws.com'], data=password)


def probe(c):
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    # Connect locally while validating the owned hostname, never a caller-supplied URL.
    import socket
    with socket.create_connection(('127.0.0.1', 443), timeout=5) as sock:
        with context.wrap_socket(sock, server_hostname=c['hostname']) as secure:
            secure.sendall(('POST /verification HTTP/1.1\r\nHost: ' + c['hostname'] + '\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}').encode())
            response = http.client.HTTPResponse(secure)
            response.begin()
            require(response.status == 401, 'Gateway readiness check failed')


def wait_gateway(c):
    import time
    for attempt in range(20):
        try:
            probe(c)
            return
        except Exception:
            if attempt == 19:
                raise
            time.sleep(1)


def preflight(c):
    # Boot is permitted only for the identical previously activated release.
    # Docker must depend on this unit before automatic container restarts.
    active(c)
    state_mount(c)
    security_profile(c)
    certificate(STATE / 'tls' / 'current', c['hostname'])
    atomic(RUN / 'worker.env', secrets(c))
    atomic(RUN / 'compose.json', json.dumps(compose(c)))


def start(c):
    approval(c)  # Must precede AWS, Docker, volume writes and any consumer start.
    state_mount(c)
    security_profile(c)
    certificate(STATE / 'tls' / 'current', c['hostname'])
    private_directory(RUN)
    env = secrets(c)
    login_registry(c)
    atomic(RUN / 'worker.env', env)
    atomic(RUN / 'compose.json', json.dumps(compose(c)))
    docker('config', '-q')
    docker('pull')
    # Do not initialize/format a disk, clear a lock or restore any database.
    worker = STATE / 'worker'
    if not worker.exists():
        worker.mkdir(mode=0o700)
        os.chown(worker, 1001, 1001)
    require(not worker.is_symlink() and worker.stat().st_uid == 1001 and worker.stat().st_mode & 0o077 == 0)
    docker('stop', 'gateway', 'worker')
    try:
        docker('up', '-d')
        # Only a transport probe is repeated; never a code/login/statement operation.
        wait_gateway(c)
        atomic(CONFIG / 'active-release.json', json.dumps({'configSha256': fingerprint(c)}))
    except Exception:
        docker('stop', 'gateway', 'worker')
        raise


def renew(c, source, initial=False):
    if initial:
        approval(c)
    else:
        active(c)
    state_mount(c)
    certificate(source, c['hostname'])
    root = STATE / 'tls'
    if initial and not root.exists():
        root.mkdir(mode=0o750)
        os.chmod(root, 0o750)
        os.chown(root, 0, 1001)
    require(root.is_dir() and not root.is_symlink() and root.stat().st_uid == 0 and root.stat().st_mode & 0o022 == 0)
    version = hashlib.sha256((source / 'fullchain.pem').read_bytes()).hexdigest()
    target = root / version
    if not target.exists():
        target.mkdir(mode=0o750)
        os.chmod(target, 0o750)
        os.chown(target, 0, 1001)
        for name in ('fullchain.pem', 'privkey.pem'):
            shutil.copyfile(source / name, target / name)
            os.chmod(target / name, 0o640)
            os.chown(target / name, 0, 1001)
    certificate(target, c['hostname'])
    if initial:
        require(not (root / 'current').exists() and not (root / 'current').is_symlink(), 'Initial certificate already exists')
        (root / 'current').symlink_to(version)
        return
    previous = os.readlink(root / 'current')
    require(re.fullmatch(r'[a-f0-9]{64}', previous))
    pending = root / 'next'
    require(not pending.exists() and not pending.is_symlink())
    pending.symlink_to(version)
    os.replace(pending, root / 'current')
    try:
        docker('restart', 'gateway')
        wait_gateway(c)
    except Exception:
        pending.symlink_to(previous)
        os.replace(pending, root / 'current')
        docker('restart', 'gateway')
        raise


def health(c):
    active(c)
    state_mount(c)
    certificate(STATE / 'tls' / 'current', c['hostname'])
    require(command(['docker', 'inspect', '-f', '{{.State.Running}}', PROJECT + '-worker-1']).strip() == 'true')
    probe(c)  # MFA wait is healthy; lack of completed statements is not a restart trigger.
    disk = os.statvfs(STATE)
    root = os.statvfs('/')
    root_used = round(100 * (1 - root.f_bavail / root.f_blocks), 2)
    return {'healthy': root_used < 85, 'diskUsedPercent': round(100 * (1 - disk.f_bavail / disk.f_blocks), 2), 'rootDiskUsedPercent': root_used}


def renew_lineage(c, source):
    active(c)
    # Certbot's live files are symlinks. Accept only its fixed root-owned layout,
    # then copy the resolved pair to a private temporary staging directory.
    lineage = source.resolve(strict=True)
    require(lineage.is_relative_to(LETSENCRYPT / 'live') and lineage.stat().st_uid == 0 and lineage.stat().st_mode & 0o022 == 0)
    private_directory(RUN)
    with tempfile.TemporaryDirectory(prefix='certificate-', dir=RUN) as staging:
        for name in ('fullchain.pem', 'privkey.pem'):
            original = (lineage / name).resolve(strict=True)
            mask = 0o027 if name == 'privkey.pem' else 0o022
            require(original.is_relative_to(LETSENCRYPT / 'archive') and original.is_file() and original.stat().st_uid == 0 and original.stat().st_mode & mask == 0)
            shutil.copyfile(original, Path(staging) / name)
            os.chmod(Path(staging) / name, 0o600)
        renew(c, Path(staging))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'preflight', 'start', 'stage-certificate', 'renew-certificate', 'renew-from-lineage', 'health', 'rollback'])
    parser.add_argument('--source', type=Path)
    parser.add_argument('--publish', action='store_true', help='Publish operational health metrics; only after a matching activated release')
    args = parser.parse_args()
    require(os.geteuid() == 0, 'Root host administration is required')
    os.umask(0o077)
    c = validate(protected_json(CONFIG / 'deployment.json'))
    require(not args.publish or args.action == 'health')
    # Kernel-held deployment lock serializes startup, certificate updates and rollback.
    private_directory(RUN)
    import fcntl
    with open(RUN / 'deployment.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'check':
            state_mount(c)
            security_profile(c)
            certificate(STATE / 'tls' / 'current', c['hostname'])
            print(json.dumps({'validated': True, 'configSha256': fingerprint(c)}))
        elif args.action == 'preflight':
            preflight(c)
            print('Approved boot configuration restored; no consumer was started')
        elif args.action == 'health':
            active(c)
            try:
                result = health(c)
            except Exception:
                result = {'healthy': False}
            if args.publish:
                metrics = [{'MetricName': 'Healthy', 'Value': int(result['healthy']), 'Unit': 'Count', 'Dimensions': [{'Name': 'Deployment', 'Value': PROJECT}]}]
                if 'diskUsedPercent' in result:
                    metrics.append({'MetricName': 'StateDiskUsedPercent', 'Value': result['diskUsedPercent'], 'Unit': 'Percent', 'Dimensions': [{'Name': 'Deployment', 'Value': PROJECT}]})
                command(['aws', '--region', c['region'], 'cloudwatch', 'put-metric-data', '--namespace', 'ComFlowWorker', '--metric-data', json.dumps(metrics)])
            print(json.dumps(result))
            require(result['healthy'], 'Host health needs attention')
        elif args.action == 'renew-from-lineage':
            require(args.source is not None)
            renew_lineage(c, args.source)
            print('Renewed certificate installed; worker session preserved')
        elif args.action in ('renew-certificate', 'stage-certificate'):
            require(args.source is not None)
            renew(c, args.source, initial=args.action == 'stage-certificate')
            print('Certificate updated; worker session preserved')
        else:
            # Rollback is an explicitly approved target config, never a blind retry.
            start(c)
            print('Approved release activated')


if __name__ == '__main__':
    try:
        main()
    except DeploymentError as error:
        print('Host operation stopped: ' + str(error), file=__import__('sys').stderr)
        raise SystemExit(1)
    except Exception:
        print('Host operation stopped safely. Check the private configuration and approval; details withheld.', file=__import__('sys').stderr)
        raise SystemExit(1)
