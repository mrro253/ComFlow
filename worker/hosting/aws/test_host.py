"""Run only in the isolated local Docker validator; no real AWS/Docker calls."""
import base64
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
import os
import ssl
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('host', Path(__file__).with_name('host.py'))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class HostRehearsal(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='comflow-host-synthetic-')
        self.root = Path(self.temp.name)
        self.config, self.state, self.run = [self.root / p for p in ('config', 'state', 'run')]
        for p in (self.config, self.state, self.run):
            p.mkdir(mode=0o700)
        self.patches = [patch.object(host, name, value) for name, value in [('CONFIG', self.config), ('STATE', self.state), ('RUN', self.run)]]
        for p in self.patches: p.start()
        self.c = {'region': 'us-east-2', 'accountId': '111122223333', 'deploymentId': host.PROJECT, 'hostname': 'verify-staging.unit-test.net', 'stateFilesystemUuid': '11111111-1111-4111-8111-111111111111', 'secretArn': 'arn:aws:secretsmanager:us-east-2:111122223333:secret:synthetic-ABC123', 'secretVersionId': 'a' * 32, 'supabaseUrl': 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', 'workerImage': '111122223333.dkr.ecr.us-east-2.amazonaws.com/worker@sha256:' + 'a' * 64, 'gatewayImage': '111122223333.dkr.ecr.us-east-2.amazonaws.com/gateway@sha256:' + 'b' * 64}
        profile = self.config / 'seccomp-playwright.json'
        profile.write_text('{"defaultAction":"SCMP_ACT_ERRNO","syscalls":[]}'); profile.chmod(0o644)
        self.c['seccompSha256'] = host.hashlib.sha256(profile.read_bytes()).hexdigest()
        self.calls = []
        self.running = False
        self.mounted = True
        self.secret = {'SUPABASE_SERVICE_ROLE_KEY': 'synthetic-service-key-never-print-123456', 'CREDENTIAL_ENCRYPTION_KEY': base64.b64encode(b'x' * 32).decode(), 'WORKER_VERIFICATION_KEY': base64.b64encode(b'y' * 32).decode()}
        self.source = self.make_cert('source')
        self.real_command = host.command
        self.fake = patch.object(host, 'command', self.execute); self.fake.start()
        self.fake_probe = patch.object(host, 'probe', lambda c: None); self.fake_probe.start()
        self.fast_wait = patch.object(host, 'wait_gateway', lambda c: host.probe(c)); self.fast_wait.start()
        self.write_json(self.config / 'deployment.json', self.c)

    def tearDown(self):
        self.fast_wait.stop(); self.fake_probe.stop(); self.fake.stop()
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    def write_json(self, path, value):
        path.write_text(json.dumps(value)); path.chmod(0o600)

    def make_cert(self, name, days=40):
        p = self.root / name; p.mkdir(mode=0o700)
        result = subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', str(days), '-keyout', str(p / 'privkey.pem'), '-out', str(p / 'fullchain.pem'), '-subj', '/CN=' + self.c['hostname'], '-addext', 'subjectAltName=DNS:' + self.c['hostname']], capture_output=True)
        self.assertEqual(result.returncode, 0)
        for f in p.iterdir(): f.chmod(0o640)
        return p

    def gate(self, **changes):
        value = {'approvedForLive': True, 'localWorkerStopped': True, 'noActiveSync': True, 'queuedWritesReviewed': True, 'configSha256': host.fingerprint(self.c), 'expiresAt': (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}
        value.update(changes); self.write_json(self.config / 'live-approval.json', value)

    def execute(self, args, *, data=None):
        self.calls.append(args)
        if args[0] == 'mountpoint':
            host.require(self.mounted, 'Test missing mount'); return ''
        if args[0] == 'findmnt': return self.c['stateFilesystemUuid']
        if args[0] == 'openssl':
            # A fixture CA is trusted only inside this test's fake command runner.
            actual = list(args)
            if '-CAfile' in actual: actual[actual.index('-CAfile') + 1] = str(Path(args[-1]))
            return self.real_command(actual)
        if args[0] == 'aws' and 'get-secret-value' in args:
            self.assertIn(self.c['secretVersionId'], args)
            return json.dumps({'VersionId': self.c['secretVersionId'], 'SecretString': json.dumps(self.secret)})
        if args[0] == 'aws' and 'get-login-password' in args: return 'synthetic-registry-token'
        if args[0] == 'aws' and 'put-metric-data' in args:
            self.assertEqual(args[args.index('--namespace') + 1], 'ComFlowWorker')
            self.assertNotIn(self.secret['SUPABASE_SERVICE_ROLE_KEY'], ' '.join(args)); return ''
        if args[:2] == ['docker', 'login']:
            self.assertEqual(data, 'synthetic-registry-token'); return ''
        if args[:2] == ['docker', 'inspect']: return 'true'
        if args[:2] == ['docker', 'compose']:
            action = args[6]
            if action == 'up': self.running = True
            if action == 'stop': self.running = False
            if action == 'config': self.assertTrue((self.run / 'worker.env').exists())
            return ''
        raise AssertionError('Unexpected command; no AWS, Docker or external network is allowed')

    def activate(self):
        self.gate(); host.renew(self.c, self.source, initial=True); host.start(self.c)

    def test_missing_or_expired_approval_prevents_all_external_commands(self):
        with self.assertRaises(Exception): host.start(self.c)
        self.assertEqual(self.calls, [])
        self.gate(expiresAt='2000-01-01T00:00:00Z')
        with self.assertRaises(ValueError): host.start(self.c)
        self.assertEqual(self.calls, [])

    def test_changed_config_or_false_attestations_cannot_activate(self):
        for changed in ({'configSha256': 'not-matching'}, {'localWorkerStopped': False}, {'queuedWritesReviewed': 'true'}):
            self.gate(**changed)
            with self.assertRaises(ValueError): host.start(self.c)
        self.assertEqual(self.calls, [])

    def test_wrong_mount_never_reads_secrets_or_creates_worker_directory(self):
        self.gate(); self.mounted = False
        with self.assertRaises(ValueError): host.start(self.c)
        self.assertFalse((self.state / 'worker').exists())
        self.assertFalse(any(a[0] == 'aws' for a in self.calls))

    def test_changed_browser_security_profile_blocks_activation(self):
        self.gate(); (self.config / 'seccomp-playwright.json').write_text('{}')
        with self.assertRaises(ValueError): host.start(self.c)
        self.assertFalse(any(a[0] == 'aws' for a in self.calls))

    def test_mutable_images_foreign_accounts_and_unknown_fields_are_rejected(self):
        for bad in ({'workerImage': 'example.com/image:latest'}, {'accountId': '999999999999'}, {'hostname': 'verify-staging.example.com'}, {'schedule': True}):
            with self.assertRaises(ValueError): host.validate({**self.c, **bad})

    def test_approved_activation_preserves_boundaries_and_private_env(self):
        self.activate()
        self.assertTrue(self.running)
        self.assertEqual((self.run / 'worker.env').stat().st_mode & 0o777, 0o600)
        c = json.loads((self.run / 'compose.json').read_text())
        self.assertEqual(c['services']['worker']['ports'], ['443:8443'])
        self.assertEqual(c['services']['worker']['environment']['SCHEDULED_SYNC_ENABLED'], 'false')
        self.assertNotIn('env_file', c['services']['gateway'])
        self.assertEqual(c['services']['gateway']['volumes'], [str(self.state / 'tls') + ':/tls:ro'])
        self.assertEqual(json.loads((self.config / 'active-release.json').read_text())['configSha256'], host.fingerprint(self.c))

    def test_incomplete_or_multiline_secret_never_starts_a_consumer(self):
        self.gate(); host.renew(self.c, self.source, initial=True)
        self.secret['SUPABASE_SERVICE_ROLE_KEY'] += '\nINJECT=true'
        with self.assertRaises(ValueError): host.start(self.c)
        self.assertFalse(self.running)
        self.assertFalse(any(a[:2] == ['docker', 'login'] for a in self.calls))

    def test_failed_readiness_stops_the_new_consumer(self):
        self.gate(); host.renew(self.c, self.source, initial=True)
        with patch.object(host, 'probe', side_effect=ValueError('synthetic failure')):
            with self.assertRaises(ValueError): host.start(self.c)
        self.assertFalse(self.running)
        self.assertFalse((self.config / 'active-release.json').exists())

    def test_explicit_rollback_stops_old_consumer_before_starting_target(self):
        self.activate(); self.calls.clear()
        self.c['gatewayImage'] = self.c['gatewayImage'].split('@')[0] + '@sha256:' + 'c' * 64
        self.gate(); host.start(self.c)
        actions = [a[6] for a in self.calls if a[:2] == ['docker', 'compose']]
        self.assertLess(actions.index('stop'), actions.index('up'))
        self.assertTrue(self.running)

    def test_boot_recreates_only_identical_approved_runtime_without_starting(self):
        self.activate(); self.gate(expiresAt='2000-01-01T00:00:00Z')
        (self.run / 'worker.env').unlink(); before = len(self.calls)
        host.preflight(self.c)
        self.assertTrue((self.run / 'worker.env').exists())
        self.assertFalse(any(a[0] == 'docker' for a in self.calls[before:]))
        with self.assertRaises(ValueError): host.preflight({**self.c, 'gatewayImage': self.c['workerImage']})

    def test_rotation_restarts_only_gateway_and_restores_pointer_on_failure(self):
        self.activate(); old = os.readlink(self.state / 'tls/current')
        source = self.make_cert('renewed')
        before = len(self.calls)
        host.renew(self.c, source)
        self.assertNotEqual(old, os.readlink(self.state / 'tls/current'))
        self.assertEqual([a[6:] for a in self.calls[before:] if a[:2] == ['docker', 'compose']], [['restart', 'gateway']])
        current = os.readlink(self.state / 'tls/current')
        with patch.object(host, 'probe', side_effect=ValueError('synthetic failure')):
            with self.assertRaises(ValueError): host.renew(self.c, self.source)
        self.assertEqual(current, os.readlink(self.state / 'tls/current'))

    def test_mismatched_key_and_expiring_certificate_are_rejected(self):
        self.activate(); source = self.make_cert('invalid-pair')
        (source / 'privkey.pem').write_bytes((self.source / 'privkey.pem').read_bytes())
        with self.assertRaises(ssl.SSLError): host.renew(self.c, source)
        with self.assertRaises(ValueError): host.renew(self.c, self.make_cert('expiring', days=1))

    def test_health_is_read_only_and_does_not_restart_an_mfa_wait(self):
        self.activate(); before = len(self.calls)
        with patch.object(host.os, 'statvfs', return_value=SimpleNamespace(f_bavail=8, f_blocks=10)):
            self.assertTrue(host.health(self.c)['healthy'])
        self.assertFalse(any(a[:2] == ['docker', 'compose'] for a in self.calls[before:]))

    def test_full_root_disk_alerts_without_restarting_or_triggering_collection(self):
        self.activate(); before = len(self.calls)
        def disk(path): return SimpleNamespace(f_bavail=1 if path == '/' else 8, f_blocks=10)
        with patch.object(host.os, 'statvfs', side_effect=disk):
            self.assertFalse(host.health(self.c)['healthy'])
        self.assertFalse(any(a[:2] == ['docker', 'compose'] for a in self.calls[before:]))

    def test_published_health_contains_only_operational_values(self):
        self.activate(); output = io.StringIO()
        with patch('sys.argv', ['host.py', 'health', '--publish']), patch.object(host.os, 'statvfs', return_value=SimpleNamespace(f_bavail=8, f_blocks=10)), redirect_stdout(output):
            host.main()
        metrics = [a for a in self.calls if 'put-metric-data' in a]
        self.assertEqual(len(metrics), 1)
        data = json.loads(metrics[0][metrics[0].index('--metric-data') + 1])
        self.assertEqual([item['MetricName'] for item in data], ['Healthy', 'StateDiskUsedPercent'])
        self.assertNotIn(self.secret['SUPABASE_SERVICE_ROLE_KEY'], output.getvalue())

    def test_real_health_tls_probe_sends_no_secrets_or_state_actions(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(inner):
                requests.append((inner.path, inner.rfile.read(2), inner.headers.get('X-Relay-Signature')))
                inner.send_response(401); inner.end_headers()
            def log_message(self, *args): pass
        server = HTTPServer(('127.0.0.1', 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_3
        context.load_cert_chain(str(self.source / 'fullchain.pem'), str(self.source / 'privkey.pem'))
        server.socket = context.wrap_socket(server.socket, server_side=True)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        import socket
        original_connect, original_context = socket.create_connection, ssl.create_default_context
        def connect(address, **kwargs):
            self.assertEqual(address, ('127.0.0.1', 443))
            return original_connect(('127.0.0.1', server.server_port), **kwargs)
        try:
            with patch('socket.create_connection', side_effect=connect), patch('ssl.create_default_context', side_effect=lambda: original_context(cafile=str(self.source / 'fullchain.pem'))):
                self.fake_probe.stop()
                try: host.probe(self.c)
                finally: self.fake_probe.start()
            self.assertEqual(requests, [('/verification', b'{}', None)])
        finally:
            server.shutdown(); server.server_close(); thread.join()

    def test_certbot_symlinks_are_staged_privately_without_access_to_worker_state(self):
        self.activate()
        root = self.root / 'letsencrypt'
        lineage, archive = root / 'live' / 'test', root / 'archive' / 'test'
        lineage.mkdir(parents=True, mode=0o700); archive.mkdir(parents=True, mode=0o700)
        renewed = self.make_cert('certbot-renewed')
        for name in ('fullchain.pem', 'privkey.pem'):
            (archive / name).write_bytes((renewed / name).read_bytes()); (archive / name).chmod(0o600)
            (lineage / name).symlink_to(archive / name)
        with patch.object(host, 'LETSENCRYPT', root):
            host.renew_lineage(self.c, lineage)
        self.assertFalse(list(self.run.glob('certificate-*')))

    def test_certificate_directory_permissions_survive_private_umask(self):
        before = os.umask(0o077)
        try:
            self.activate()
            self.assertEqual((self.state / 'tls').stat().st_mode & 0o777, 0o750)
            self.assertEqual((self.state / 'tls/current').stat().st_mode & 0o777, 0o750)
        finally:
            os.umask(before)

    def test_cli_errors_do_not_print_secret_values(self):
        self.gate(queuedWritesReviewed=False)
        output, errors = io.StringIO(), io.StringIO()
        with patch('sys.argv', ['host.py', 'start']), redirect_stdout(output), redirect_stderr(errors):
            with self.assertRaises(ValueError): host.main()
        self.assertNotIn(self.secret['SUPABASE_SERVICE_ROLE_KEY'], output.getvalue() + errors.getvalue())


if __name__ == '__main__':
    unittest.main()
