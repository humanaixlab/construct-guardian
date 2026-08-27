import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicAssessmentAttacker, type AssessmentAttacker } from "../lib/attacker/attacker.ts";
import { DeterministicConstructAnalyst, type ConstructAnalyst } from "../lib/construct/analyst.ts";
import { GOLDEN_DEMO, type GuardianRun } from "../lib/guardian.ts";
import { createAgentCoreObservability, type TelemetryDriver, type TelemetrySpan } from "../lib/observability/agentcore.server.ts";
import { runObservedGuardian } from "../lib/observability/run.server.ts";
import { LIFECYCLE_STAGES } from "../lib/observability/types.ts";
import { DeterministicQualityEvaluator } from "../lib/quality/evaluator.ts";
import { DeterministicRepairAgent } from "../lib/repair/agent.ts";

type SpanRecord = { name: string; attributes: Record<string, string | number | boolean>; success?: boolean; ended: boolean };
class RecordingSpan implements TelemetrySpan {
  private readonly record: SpanRecord;
  constructor(record: SpanRecord) { this.record = record; }
  setAttributes(attributes: Record<string, string | number | boolean>) { Object.assign(this.record.attributes, attributes); }
  setSuccess(success: boolean) { this.record.success = success; }
  end() { this.record.ended = true; }
}
class RecordingDriver implements TelemetryDriver {
  roots: SpanRecord[] = [];
  spans: SpanRecord[] = [];
  async withRoot<T>(name: string, attributes: Record<string, string | number | boolean>, operation: (span: TelemetrySpan) => Promise<T>) {
    const record = { name, attributes: { ...attributes }, ended: false };
    this.roots.push(record);
    try { return await operation(new RecordingSpan(record)); }
    finally { record.ended = true; }
  }
  startSpan(name: string, attributes: Record<string, string | number | boolean>) {
    const record = { name, attributes: { ...attributes }, ended: false };
    this.spans.push(record);
    return new RecordingSpan(record);
  }
}

const providers = { attacker: new DeterministicAssessmentAttacker(), quality: new DeterministicQualityEvaluator(), repair: new DeterministicRepairAgent() };
const modelId = "global.anthropic.claude-sonnet-4-6";
async function observed(driver = new RecordingDriver()) {
  const run = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: true, driver }), modelId);
  return { run, driver };
}
const domainOnly = (run: GuardianRun) => { const domain = { ...run }; delete domain.observability; return domain; };

test("one enabled run creates exactly one root trace", async () => {
  const { driver } = await observed();
  assert.equal(driver.roots.length, 1);
  assert.equal(driver.roots[0].name, "construct_guardian.run");
});

test("the full expected lifecycle is emitted", async () => {
  const { driver } = await observed();
  assert.deepEqual(driver.spans.map((span) => span.attributes["guardian.stage"]), [...LIFECYCLE_STAGES]);
});

test("provider provenance is included without assessment content", async () => {
  const { driver } = await observed();
  const providerSpans = driver.spans.filter((span) => span.attributes["guardian.provider"]);
  assert.ok(providerSpans.length >= 4);
  assert.ok(providerSpans.every((span) => span.attributes["guardian.provider"] === "STRANDS_BEDROCK"));
});

test("stable strategyId appears in attack outcome and exact re-attack trace data", async () => {
  const { run, driver } = await observed();
  const bypass = driver.spans.find((span) => span.attributes["guardian.stage"] === "construct_bypass_evaluation")!;
  const reattack = driver.spans.find((span) => span.attributes["guardian.stage"] === "exact_strategy_reattack")!;
  assert.equal(bypass.attributes["guardian.strategy_id"], run.successfulAttack?.id);
  assert.equal(reattack.attributes["guardian.strategy_id"], run.reattack?.id);
  assert.equal(run.successfulAttack?.id, run.reattack?.id);
});

test("final outcome and workflow status are recorded", async () => {
  const { driver } = await observed();
  const final = driver.spans.at(-1)!;
  assert.equal(final.attributes["guardian.stage"], "final_outcome");
  assert.equal(final.attributes["guardian.final_workflow_status"], "BYPASS_CLOSED");
  assert.equal(final.attributes["guardian.reattack_outcome"], "BYPASS_CLOSED");
});

test("provider fallback reason is traced only as a safe category", async () => {
  const failing: AssessmentAttacker = { generateAttacks: async () => { throw new Error("ThrottlingException: Too many tokens per day"); } };
  const driver = new RecordingDriver();
  await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), { ...providers, attacker: failing }, createAgentCoreObservability({ enabled: true, driver }), modelId);
  const attack = driver.spans.find((span) => span.attributes["guardian.stage"] === "assessment_attack")!;
  assert.equal(attack.attributes["guardian.fallback_used"], true);
  assert.equal(attack.attributes["guardian.fallback_reason_category"], "THROTTLING");
});

test("AgentCore failure does not alter domain output", async () => {
  const baseline = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: false }), modelId);
  const failingDriver: TelemetryDriver = { withRoot: async () => { throw new Error("collector unavailable"); }, startSpan: () => { throw new Error("unavailable"); } };
  const failedTelemetry = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: true, driver: failingDriver }), modelId);
  assert.deepEqual(domainOnly(failedTelemetry), domainOnly(baseline));
});

test("AgentCore failure does not alter bypass calculations", async () => {
  const failingDriver: TelemetryDriver = { withRoot: async () => { throw new Error("timeout"); }, startSpan: () => { throw new Error("timeout"); } };
  const run = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: true, driver: failingDriver }), modelId);
  assert.equal(run.successfulAttack?.bypassScore, 1);
  assert.equal(run.reattack?.bypassScore, 1);
});

test("AgentCore failure does not alter workflow state", async () => {
  const failingDriver: TelemetryDriver = { withRoot: async () => { throw new Error("misconfigured"); }, startSpan: () => { throw new Error("misconfigured"); } };
  const run = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: true, driver: failingDriver }), modelId);
  assert.deepEqual(run.states, ["INGESTED", "CONSTRUCT_MODELED", "ATTACK_EXECUTED", "BYPASS_CONFIRMED", "REPAIR_PROPOSED", "REATTACKED", "BYPASS_CLOSED"]);
});

test("disabled observability behaves as a local no-op", async () => {
  const driver = new RecordingDriver();
  const run = await runObservedGuardian(GOLDEN_DEMO, new DeterministicConstructAnalyst(), providers, createAgentCoreObservability({ enabled: false, driver }), modelId);
  assert.equal(driver.roots.length, 0);
  assert.equal(driver.spans.length, 0);
  assert.equal(run.observability?.provider, "LOCAL_NOOP");
});

test("credentials, secrets, raw failures, and assessment content are never emitted", async () => {
  const secret = "AWS_SECRET_ACCESS_KEY=do-not-emit";
  const failing: ConstructAnalyst = { analyze: async () => { throw new Error(secret); } };
  const driver = new RecordingDriver();
  await runObservedGuardian(GOLDEN_DEMO, failing, providers, createAgentCoreObservability({ enabled: true, driver }), modelId);
  const telemetry = JSON.stringify({ roots: driver.roots, spans: driver.spans });
  assert.doesNotMatch(telemetry, /do-not-emit|AWS_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(telemetry, new RegExp(GOLDEN_DEMO.assignmentPrompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Golden Demo remains complete with AgentCore tracing enabled", async () => {
  const { run } = await observed();
  assert.equal(run.successfulAttack?.id, "full-generation");
  assert.equal(run.repair?.repairMechanism, "CONSTRAINED_IN_CLASS_RESPONSE");
  assert.equal(run.reattack?.blockedByHumanOnlyRequirement, true);
  assert.equal(run.states.at(-1), "BYPASS_CLOSED");
});
