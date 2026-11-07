// Offline review bundle only. Intentionally no AWS deployment/apply operation.
import { mkdir, readdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { infrastructureTemplate } from "./template.mjs";

export async function prepare(destination) {
  const directory = resolve(destination);
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length) throw new Error("Review output must be a new empty directory; existing release files are never overwritten");
  const source = fileURLToPath(new URL("./", import.meta.url));
  const profile = {
    region: "us-east-2", accountId: "111122223333", deploymentId: "comflow-staging-worker",
    hostname: "verify-staging.example.com", stateFilesystemUuid: "REPLACE_WITH_REVIEWED_STATE_UUID",
    secretArn: "arn:aws:secretsmanager:us-east-2:111122223333:secret:REPLACE_WITH_STACK_OUTPUT",
    secretVersionId: "REPLACE_WITH_APPROVED_SECRET_VERSION",
    seccompSha256: createHash("sha256").update(await readFile(join(source, "../seccomp-playwright.json"))).digest("hex"),
    workerImage: "111122223333.dkr.ecr.us-east-2.amazonaws.com/REPLACE_WORKER@sha256:REPLACE_WITH_APPROVED_DIGEST",
    gatewayImage: "111122223333.dkr.ecr.us-east-2.amazonaws.com/REPLACE_GATEWAY@sha256:REPLACE_WITH_APPROVED_DIGEST",
    supabaseUrl: "https://REPLACE_WITH_REVIEWED_PROJECT.supabase.co",
  };
  const documents = {
    "infrastructure.review.json": infrastructureTemplate(),
    "deployment.example.json": profile,
    "live-approval.DISABLED.example.json": { approvedForLive: false, localWorkerStopped: false, noActiveSync: false, queuedWritesReviewed: false, configSha256: "REPLACE_AFTER_FINAL_REVIEW", expiresAt: "2000-01-01T00:00:00Z" },
    "parameters.example.json": ["ApprovedAmiId", "AvailabilityZone", "VpcCidr", "SubnetCidr", "OwnerEmail"].map(ParameterKey => ({ ParameterKey, ParameterValue: "REPLACE_AFTER_FINAL_REVIEW" })),
  };
  for (const [name, data] of Object.entries(documents)) await writeFile(join(directory, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  for (const name of ["host.py", "check-host.sh", "comflow-worker.service", "comflow-preflight.service", "docker-preflight.conf", "comflow-health.service", "comflow-health.timer"]) await copyFile(join(source, name), join(directory, name));
  await copyFile(join(source, "../seccomp-playwright.json"), join(directory, "seccomp-playwright.json"));
  await writeFile(join(directory, "REVIEW-ONLY.txt"), "Nothing has been applied. No live approval, credentials, real parameters, certificates or initialized volumes are provided. See docs/aws-deployment-scripts-review.md before any approved use.\n", { flag: "wx" });
  return { directory, resources: Object.keys(documents["infrastructure.review.json"].Resources).length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--out") throw new Error("Usage: node worker/hosting/aws/prepare.mjs --out <new-local-review-directory>");
  const result = await prepare(args[1]);
  console.log(`Prepared ${result.resources} review resource definitions locally. No AWS calls or live activation.`);
}
