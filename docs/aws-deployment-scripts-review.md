# AWS deployment scripts — offline review, 2026-11-07

Prepared on `feature/ghl-contact-preview`. No AWS resources, DNS records, certificates, cloud secrets, application settings or imported records were changed. The bundle does not contain an apply command or a live activation approval.

## Prepare and test locally

From the repository root:

```powershell
node worker/hosting/aws/prepare.mjs --out .pgtest/aws-review-new
& ./worker/hosting/aws/test-scripts.ps1
```

Choose a new empty output directory each time. Preparation uses no network or AWS credentials and refuses to overwrite an existing bundle. The test harness builds a disposable local validation image using public packages; its host tests run without networking, AWS credentials or a Docker socket. The final Compose check parses configuration only; it never starts a worker.

The bundle contains a CloudFormation review template with 28 resource definitions, placeholder parameters, a deployment profile, a deliberately disabled approval example, host operations, systemd units and the approved browser security profile. The resource list covers the dedicated network, one instance and IP, encrypted disks, private image repositories, empty runtime secret, scoped host role, weekly state backups, operational alarms and budget notifications. It creates no DNS zone or record. Future provisioning would incur costs and send owner notification subscriptions; nothing has been submitted to AWS.

## Host controls

`host.py` requires Linux root administration and protected configuration in `/etc/comflow`. It binds activation to the exact account, Ohio region, private image digests, secret version, hostname, security-profile hash and state filesystem UUID. A short-lived approval must confirm that the local consumer is stopped, no sync is active and queued writes have been reviewed. Placeholder profiles cannot activate.

The state mount must already exist at `/var/lib/comflow-state`. The scripts never format disks, create filesystems, restore a database, clear worker locks or modify commission records. They fetch a pinned runtime secret into a root-only file under `/run/comflow`; it is passed only to the worker. The gateway receives only its read-only certificate directory. Secret command output is captured and withheld from error messages.

Startup stops the previous services before starting the approved target. Failed readiness stops the new consumer. Rollback uses a separately reviewed target profile and fresh approval, preserving state and stopping the current consumer first. It does not automatically replay logins, security codes, imports or GHL work. Collection scheduling remains off; a live consumer could process existing queued work, so activation is deliberately separate from this preparation.

## Future installation order — requires a separate approved deployment

1. Verify the actual account, AMI, network ranges, owner address and resource change list before provisioning. Install reviewed host prerequisites: Python 3.12+, AWS CLI 2, Docker with Compose, OpenSSL and the Linux mount/locking tools. `check-host.sh` checks presence only; it installs nothing.
2. Review and mount the intended encrypted state volume by UUID. Install scripts in `/opt/comflow`, root-owned and protected from other users' writes. Store the real deployment profile and activation approval in `/etc/comflow` as root-owned `0600` JSON files. Keep keys and real parameters outside Git.
3. Obtain a trusted certificate for the future owned domain through the separately approved DNS-01 process. Use `host.py stage-certificate --source <protected-directory>` to validate and stage the initial certificate/key pair with fresh approval. This command does not request a certificate or change DNS.
4. Run the approved first activation manually through `comflow-worker.service`. That unit intentionally has no boot enablement target. Confirm successful activation and its matching `active-release.json` before installing `docker-preflight.conf` in Docker's systemd drop-in directory.
5. Install `comflow-preflight.service` with that Docker dependency. It verifies the mount and activated profile and restores the temporary secret/configuration before Docker can restart containers after a reboot. It starts no consumer itself. A changed profile requires new activation approval. Review this ordering on the actual host before enabling startup.
6. Enable the health timer only after activation and validate notification delivery. Health checks use an unauthenticated TLS 1.3 request that cannot trigger an import. They publish only health and disk metrics, tolerate an MFA wait and do not restart the browser.

Certificate renewal can call `host.py renew-from-lineage --source <certbot-live-directory>` from an authorized root-owned Certbot deployment hook. It accepts protected files resolving beneath `/etc/letsencrypt/archive`, validates the hostname, trusted chain, key pair and remaining lifetime, swaps the pair atomically and restarts only the gateway. Failure restores the previous certificate pointer. The browser session remains running. DNS-provider permissions, certificate issuance and the hook's actual installation are still pending.

## Validation completed

- 19 host tests passed, covering approval refusal, wrong mounts, changed settings, secret validation, startup failure, rollback ordering, boot recovery, gateway-only certificate rotation, certificate failure recovery and operational-only metrics.
- Two Node tests passed for offline preparation, non-overwrite behavior and infrastructure boundaries.
- CloudFormation passed `cfn-lint` 1.60.0; systemd dependency ordering, shell syntax, JavaScript lint and real Docker Compose configuration parsing passed.
- The TLS probe was exercised against a local fixture server. AWS and Docker host actions were mocked, not sent to a real account or daemon. No real client data was used.

These checks do not prove EC2 startup, IAM permissions, SSM access, registry pulls, real certificate issuance or remote access from Vercel. The production worker/gateway images were unchanged; their previous scans and hosting rehearsal are documented separately.

## Remaining before provisioning or live activation

Confirm account ownership and agreements, final AMI/root-device mapping, installed host package sources, volume initialization/mounting, container metadata blocking, outbound networking and the future domain/DNS provider. Complete the certificate issuer setup and operational log-agent configuration; the template provides the log group/permissions, while Docker has local log rotation. Recheck pricing and image scans, review the final populated template and explicitly approve resource creation. Then rehearse on the actual host with synthetic data before any separate live queue cutover. This is tested preparation, not a completed AWS deployment.
