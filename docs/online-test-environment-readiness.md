# Online test environment: account and setup audit

Checked November 3, 2026 on feature/ghl-contact-preview. This is an audit and setup plan, not a deployment. Main, the working database, imported statements and GHL records were not changed.

## Account control: confirmed versus unknown

| Resource | Evidence | Status / next check |
| --- | --- | --- |
| Ryan's GitHub | Connected account is ryanb1210. GitHub reports admin, maintain, push and pull permissions on the private ryanb1210/ComFlow repository. | Confirmed control of this repository. Use it as the source for Ryan-owned test infrastructure. |
| Marshall's GitHub | Existing review branches have been pushed to mrro253/ComFlow as well. The connector's collaborator-permission lookup returned 403, resource not accessible by integration. | Branch write access has worked; administrator, billing and deployment-control access are not established by that fact. |
| Working database | The active private preview points to 127.0.0.1:54321; supabase/config.toml describes the local commissionflow Docker project. | Local runtime, not proof of a hosted Supabase account. |
| Hosted Supabase | Browser dashboard reaches Sign in. No hosted-project linkage was found in this checkout. Supabase connector is available but not connected. | Ryan confirmed that he has not created these accounts. A new Ryan-controlled account/organization and isolated test project are needed; no cloud role, billing or backup plan exists for this setup yet. |
| Vercel | Browser dashboard reaches Log in. No .vercel linkage or deployment workflow was found in the checkout. Connector is available but not connected. | Ryan confirmed that he has not created these accounts. Vercel is an option to evaluate, not a selected host; do not create a Vercel account solely because this audit checked its dashboard. |
| Background-worker host / domain / email service | No verified hosting account, domain-control evidence or hosted email configuration established in this audit. | Choose or identify these after account access is known. No new subscription is assumed. |

Ryan subsequently confirmed in chat that he has not created the Supabase/Vercel accounts. That is user-reported account status; dashboard roles could not be inspected. A sign-in page alone would not establish account existence. No account was created, no provider permissions were granted, and no subscription, paid resource or deployment was started. Passwords and API keys must be entered in the provider/setup interface, not chat or Git. GitHub repository administration does not establish control of linked cloud services.

## What the application needs online

1. A Next.js Node web service connected to the review branch, with HTTPS and a stable test URL. Keep Main and eventual production deployments separate. Restrict the initial test audience; do not leave the current signup route open for unrestricted public onboarding.
2. A new, separate hosted Supabase test project with database, Auth and a private statements storage bucket. Apply reviewed migrations 0001 through 0018 in order and verify service-only grants and owner/agent separation on that target. Do not copy the working database or real statements to bootstrap it.
3. An independently running Node GHL queue consumer. A web deployment alone does not start worker/src/ghlImportWorker.ts. Install root dependencies and worker dependencies; supply secrets through the host. The existing command without a local env-file dependency is:

   ```sh
   node worker/node_modules/tsx/dist/cli.mjs --tsconfig worker/tsconfig.json worker/src/ghlImportWorker.ts
   ```

   Keep automatic processing off until fictional account separation and recovery tests pass. Do not point test automation at the current real GHL location. Use a separate test location/token and fictional contacts for live-provider verification.
4. Carrier-browser execution and an agent-visible verification flow. Ultimate, UHC, Devoted and SunFire currently launch Chromium with headless:false. Their verification windows are local desktop interactions. An ordinary hosted web page cannot display that server desktop to an agent. Choose and implement an authenticated remote-browser verification flow, or explicitly retain a local carrier collector during the first online pilot. A local collector still depends on that computer being on. Keep carrier collection manual through Sync now.
5. Provider-owned secret storage, logs, restart policies, backups and recovery verification. The long-lived GHL worker and browser collector are distinct workloads. The carrier collector uses a local lock/recovery journal: retain one collector and durable private runtime storage until distributed ownership/recovery is designed and tested. Do not launch extra copies through automatic scaling.

## Deployment gaps found in source

- **Upload size:** next.config.ts permits 32 MB Server Action bodies. Vercel documents a 4.5 MB standard Function request/response limit. The Next.js setting cannot raise that provider limit. Before choosing that deployment path, either implement authenticated direct-to-private-storage uploads followed by verified server-side references, or choose/configure a Node host with compatible upload limits. Exercise representative large PDFs and paired Devoted files on the actual host.
- **Persistent work:** no committed deployment workflow, worker service configuration or cloud startup registration was found. The polling consumer must run as an explicitly provisioned service, not an unbounded request handler.
- **Authentication:** local Supabase configuration uses localhost redirects and disables email confirmations. Configure the actual HTTPS test site and allowed redirects in hosted Auth; establish test-user provisioning and email/password-recovery delivery before inviting testers. Do not assume local mail capture works online.
- **Secret separation:** web and GHL worker need the same test-project URL and server key, plus the same new test encryption key. Their values must differ from the working local environment. Never copy the local .env file or expose server secrets using NEXT_PUBLIC_ names. New credentials must be entered in the test environment rather than copied from the real database.
- **Source recovery:** a database backup is not a complete backup of statement files. Supabase's database backups exclude Storage API objects. Maintain and test restoration of database data and private source files separately; preserve the encryption key in secure recovery storage.
- **Operational proof:** the existing 707-test local suite and isolated database drills do not establish hosted deployment, cloud backup restoration, agent-visible cloud MFA or a cloud GHL end-to-end run. Those remain acceptance checks.

## Test-only configuration checklist

| Setting / resource | Requirement |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | New hosted test project's URL; never localhost or the real working project. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Matching test project's public client key. |
| SUPABASE_SERVICE_ROLE_KEY | Matching test project's server-only key; provider secret storage only. |
| CREDENTIAL_ENCRYPTION_KEY | Newly generated test-only key shared by test web/worker services; preserve securely. |
| SCHEDULED_SYNC_ENABLED | false; retrieval remains agent initiated. |
| DEVOTED_REVIEW_ENABLED / DEVOTED_IMPORT_REVIEW_ENABLED | Initially false; evaluate explicitly for the isolated synthetic Devoted rehearsal. |
| GHL automation setting | Initially off for test accounts; enable only with a test location/token. |
| Auth / access | Exact test URL/redirects, restricted testers, confirmed recovery email flow. |
| Statement storage | Private bucket, reviewed access policies and separate source-file backups. |
| Worker startup | Explicit GHL service; separately approved carrier-browser runtime and verification access. |

## Order of work

- [x] Verify Ryan's repository administration and current review branch.
- [x] Identify the local database and current worker architecture without printing secrets.
- [x] Record upload-size, verification-browser, startup and backup gaps.
- [x] Establish whether existing Supabase/Vercel accounts need transfer: Ryan reports these accounts have not been created.
- [ ] Select providers and create Ryan-owned accounts; verify organization/team role, billing authority and plan before provisioning resources.
- [ ] Select the web/worker host using the upload and browser requirements; establish a spending limit before paid provisioning.
- [ ] Create a separate test project/services using fictional fixtures, test-only secrets and a test GHL location.
- [ ] Verify login, password recovery, owner/agent isolation, small/large imports, repeated/corrected imports, GHL result reporting, interrupted-run recovery and restored source files.
- [ ] Validate the carrier verification experience on the chosen runtime before claiming Sync now works with the agent's computer off.

## Provider references checked during the audit

- [Vercel Function limits](https://vercel.com/docs/functions/limitations): request size and execution-duration constraints. This audit does not claim all Vercel hosting products share the same execution model.
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups): database backup coverage and exclusion of Storage API objects.

Immediate next step: prepare a new Supabase account under Ryan's control and select the web/worker host after resolving upload and browser requirements. Vercel is optional, not a prerequisite. No cloud deployment or migration is authorized merely by this audit document; this document does not substitute for verified provider access.
