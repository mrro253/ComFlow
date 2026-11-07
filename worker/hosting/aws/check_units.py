"""Offline systemd verification only; never starts a service or runs AWS."""
import os
from pathlib import Path
import subprocess
import tempfile

# Disposable validator container only. There is no Docker daemon socket here.
assert os.geteuid() == 0 and Path('/review/host.py').is_file()
docker = Path('/usr/bin/docker')
assert not docker.exists(), 'Do not replace a real Docker installation'
docker.write_text('#!/bin/sh\nexit 1\n')
docker.chmod(0o755)
try:
    with tempfile.TemporaryDirectory(prefix='comflow-systemd-fixtures-') as root:
        root = Path(root)
        (root / 'docker.service').write_text('[Unit]\nDescription=Synthetic dependency only\n[Service]\nType=oneshot\nExecStart=/usr/bin/true\nRemainAfterExit=yes\n')
        dropin = root / 'docker.service.d'; dropin.mkdir()
        (dropin / 'comflow-state.conf').write_text(Path('/review/docker-preflight.conf').read_text())
        units = []
        for source in list(Path('/review').glob('comflow-*.service')) + [Path('/review/comflow-health.timer')]:
            target = root / source.name
            target.write_text(source.read_text()); target.chmod(0o644); units.append(str(target))
        env = {**os.environ, 'SYSTEMD_UNIT_PATH': str(root) + ':/usr/lib/systemd/system:/lib/systemd/system'}
        units.append(str(root / 'docker.service'))
        subprocess.run(['systemd-analyze', 'verify', *units], env=env, check=True)
        subprocess.run(['/bin/sh', '-n', '/review/check-host.sh'], check=True)
        print('Offline systemd ordering and shell syntax checks passed; no services started')
finally:
    docker.unlink()
