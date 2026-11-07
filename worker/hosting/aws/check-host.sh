#!/bin/sh
set -eu
# Read-only prerequisite check. No package installation, mounts, formatting or AWS calls.
[ "$(id -u)" = 0 ] || { echo 'Run the host prerequisite check as the authorized administrator.' >&2; exit 1; }
for tool in python3 aws docker openssl mountpoint findmnt flock; do
  command -v "$tool" >/dev/null || { echo 'A required host prerequisite is missing.' >&2; exit 1; }
done
docker compose version >/dev/null
case "$(aws --version 2>&1)" in aws-cli/2.*) ;; *) echo 'AWS CLI version 2 is required.' >&2; exit 1 ;; esac
python3 -c 'import ssl,sys; assert sys.version_info >= (3, 12); assert ssl.HAS_TLSv1_3'
echo 'Host prerequisites found. No services were started; mount, IAM, firewall, DNS and certificate checks remain required.'
