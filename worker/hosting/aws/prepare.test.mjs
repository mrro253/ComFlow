import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepare } from "./prepare.mjs";
import { infrastructureTemplate } from "./template.mjs";

test("offline bundle never contains a live approval or auto-start user data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "comflow-aws-review-"));
  try {
    const result = await prepare(dir);
    assert(result.resources > 20);
    const gate = JSON.parse(await readFile(join(dir, "live-approval.DISABLED.example.json")));
    assert.equal(gate.approvedForLive, false);
    const template = JSON.parse(await readFile(join(dir, "infrastructure.review.json")));
    assert.equal(template.Resources.WorkerHost.Properties.UserData, undefined);
    await assert.rejects(prepare(dir), /empty directory/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("resource boundaries match the approved pilot design", () => {
  const r = infrastructureTemplate().Resources;
  assert.equal(Object.values(r).filter(x => x.Type === "AWS::EC2::Instance").length, 1);
  assert.equal(r.WorkerHost.Properties.InstanceType, "t3.medium");
  assert.equal(r.WorkerHost.Properties.MetadataOptions.HttpTokens, "required");
  assert.equal(r.WorkerHost.Properties.MetadataOptions.HttpPutResponseHopLimit, 1);
  assert.equal(r.WorkerHost.Properties.CreditSpecification.CPUCredits, "standard");
  assert.equal(r.StateDisk.DeletionPolicy, "Retain");
  assert.equal(r.StateDisk.Properties.Encrypted, true);
  assert.deepEqual(r.Firewall.Properties.SecurityGroupIngress.map(p => [p.FromPort,p.ToPort]), [[443,443]]);
  assert(!Object.values(r).some(x => /LoadBalancer|NatGateway|DBInstance|HostedZone/.test(x.Type)));
  const statements = r.WorkerRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.equal(statements.find(x => x.Action === "secretsmanager:GetSecretValue").Resource.Ref, "RuntimeSecret");
  assert.equal(r.RuntimeSecret.Properties.SecretString, "{}");
  assert.equal(r.StateBackups.Properties.PolicyDetails.Schedules[0].RetainRule.Count, 2);
});
