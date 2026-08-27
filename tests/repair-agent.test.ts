import test from "node:test";
import assert from "node:assert/strict";
import type { AssessmentAttacker } from "../lib/attacker/attacker.ts";
import type { QualityEvaluator } from "../lib/quality/evaluator.ts";
import type { QualityResult } from "../lib/quality/schema.ts";
import { deterministicRepairCandidate, generateRepair, type RepairAgent } from "../lib/repair/agent.ts";
import { validateRepair } from "../lib/repair/schema.ts";
import { GOLDEN_DEMO, buildConstructModel, evaluateAttack, executeAttacks, proposeRepair, reattack } from "../lib/guardian.ts";
import { runGuardianWithProviders } from "../lib/workflow.server.ts";

const model = buildConstructModel(GOLDEN_DEMO);
const fullAttack = executeAttacks(model)[2];
const quality: QualityResult = { strategyId: fullAttack.id, criteria: [], overallQuality: fullAttack.qualityScore };
const provider = (value: unknown): RepairAgent => ({ proposeRepair: async () => value });
const partialAttack = (retainedEvidenceIds: string[]) => ({ ...evaluateAttack(model, { id: "partial-test", name: "Partial", aiRole: "AI delegates work.", retainedEvidenceIds, qualityScore: 0.95, simulatedSubmission: "Strong submission" }), bypassDetected: true });

test("valid structured repair is accepted", async () => {
  const candidate = deterministicRepairCandidate(model, fullAttack);
  const result = await generateRepair(GOLDEN_DEMO, model, fullAttack, quality, provider(candidate));
  assert.equal(result.provenance.provider, "STRANDS_BEDROCK");
  assert.equal(result.repair.repairMechanism, "CONSTRAINED_IN_CLASS_RESPONSE");
});

test("repair requires actual successful bypass evidence IDs", () => {
  const candidate = deterministicRepairCandidate(model, fullAttack);
  candidate.lostEvidenceIds = candidate.lostEvidenceIds.slice(1);
  assert.throws(() => validateRepair(candidate, GOLDEN_DEMO, model, fullAttack), /exactly match/);
});

test("repair rejects invented targeted evidence IDs", () => {
  const candidate = deterministicRepairCandidate(model, fullAttack);
  candidate.targetedEvidenceIds = ["invented"];
  assert.throws(() => validateRepair(candidate, GOLDEN_DEMO, model, fullAttack), /invented evidence/);
});

test("different evidence loss patterns choose different repair mechanisms", () => {
  const selection = proposeRepair(GOLDEN_DEMO, model, partialAttack(["identify", "justify", "alternative"]));
  const justification = proposeRepair(GOLDEN_DEMO, model, partialAttack(["identify", "select", "alternative"]));
  assert.notEqual(selection.repairMechanism, justification.repairMechanism);
});

test("oral defense is not the default repair", () => {
  assert.notEqual(proposeRepair(GOLDEN_DEMO, model, fullAttack).repairMechanism, "LIVE_ORAL_DEFENSE");
});

test("accepted repair preserves original assignment plus one bounded requirement", () => {
  const repair = proposeRepair(GOLDEN_DEMO, model, fullAttack);
  assert.equal(repair.repairedAssignment, `${GOLDEN_DEMO.assignmentPrompt}\n\n${repair.repairText}`);
});

test("generic full assignment rewrite is rejected", () => {
  const candidate = deterministicRepairCandidate(model, fullAttack);
  candidate.repairText = "Rewrite the entire assignment as a new task.";
  assert.throws(() => validateRepair(candidate, GOLDEN_DEMO, model, fullAttack), /full-assignment rewrites/);
});

test("human-only flag is rejected for non-live bounded mechanisms", () => {
  const attack = partialAttack(["identify", "justify", "alternative"]);
  const candidate = deterministicRepairCandidate(model, attack);
  candidate.humanOnlyRequirement = true;
  assert.throws(() => validateRepair(candidate, GOLDEN_DEMO, model, attack), /Only constrained/);
});

test("Repair Agent cannot mutate bypass thresholds or workflow state", async () => {
  const hostile = { ...deterministicRepairCandidate(model, fullAttack), bypassDetected: false, states: ["BYPASS_CLOSED"] };
  const result = await generateRepair(GOLDEN_DEMO, model, fullAttack, quality, provider(hostile));
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.equal(fullAttack.bypassDetected, true);
});

test("accepted repair preserves stable successful strategy ID into re-attack", () => {
  const repeated = reattack(model, fullAttack, proposeRepair(GOLDEN_DEMO, model, fullAttack));
  assert.equal(repeated.id, fullAttack.id);
});

test("repair throttling triggers deterministic fallback", async () => {
  const failing: RepairAgent = { proposeRepair: async () => { throw new Error("ThrottlingException: Too many tokens per day"); } };
  const result = await generateRepair(GOLDEN_DEMO, model, fullAttack, quality, failing);
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.match(result.provenance.fallbackReason ?? "", /ThrottlingException/);
});

test("Golden Demo completes end-to-end under deterministic fallbacks and genuinely blocks the same exploit", async () => {
  const failingAttacker: AssessmentAttacker = { generateAttacks: async () => { throw new Error("offline"); } };
  const failingQuality: QualityEvaluator = { evaluate: async () => { throw new Error("offline"); } };
  const failingRepair: RepairAgent = { proposeRepair: async () => { throw new Error("offline"); } };
  const run = await runGuardianWithProviders(GOLDEN_DEMO, { model, provider: "DETERMINISTIC_FALLBACK", fallbackReason: "offline" }, { attacker: failingAttacker, quality: failingQuality, repair: failingRepair });
  assert.equal(run.successfulAttack?.id, run.reattack?.id);
  assert.equal(run.successfulAttack?.qualityScore, run.reattack?.qualityScore);
  assert.equal(run.successfulAttack?.bypassScore, run.reattack?.bypassScore);
  assert.equal(run.reattack?.blockedByHumanOnlyRequirement, true);
  assert.equal(run.states.at(-1), "BYPASS_CLOSED");
});
