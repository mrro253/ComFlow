# Third-party security profile

`seccomp-playwright.json` derives from Microsoft's Playwright v1.65.0 `utils/docker/seccomp_profile.json`, licensed under Apache-2.0. The upstream profile is identical to v1.64.0; the local Chromium namespace adjustment remains unchanged. The accompanying license is in `LICENSE.playwright`.

Source: https://github.com/microsoft/playwright/blob/v1.65.0/utils/docker/seccomp_profile.json

Modification: the namespace syscall rule additionally permits `chroot`, needed by Chromium's sandbox with all host capabilities dropped. Kernel capability checks still apply within the browser's user namespace. The rule's comment documents this change. No unconfined profile or host SYS_ADMIN capability is used.
