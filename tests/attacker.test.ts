import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicAssessmentAttacker, generateAssessmentAttacks, type AssessmentAttacker } from "../lib/attacker/attacker.ts";
import { validateAttackSet } from "../lib/attacker/schema.ts";
import { GOLDEN_DEMO, buildConstructModel, evaluateAttack, proposeRepair, reattack } from "../lib/guardian.ts";

const model = buildConstructModel(GOLDEN_DEMO);
async function validSet() { return new DeterministicAssessmentAttacker().generateAttacks(GOLDEN_DEMO, model); }
const provider = (value: unknown): AssessmentAttacker => ({ generateAttacks: async () => value });

test("valid structured attacker output is accepted", async () => {
  const result = await generateAssessmentAttacks(GOLDEN_DEMO, model, provider(await validSet()));
  assert.equal(result.provenance.provider, "STRANDS_BEDROCK");
  assert.equal(result.strategies.length, 3);
});

test("attacker rejects invalid evidence IDs", async () => {
  const value = await validSet();
  value.strategies[0].retainedHumanEvidenceIds[0] = "invented";
  assert.throws(() => validateAttackSet(value, model), /nonexistent evidence/);
});

test("attacker rejects duplicate evidence mappings", async () => {
  const value = await validSet();
  value.strategies[0].retainedHumanEvidenceIds.push(value.strategies[0].retainedHumanEvidenceIds[0]);
  assert.throws(() => validateAttackSet(value, model), /duplicate evidence/);
});

test("attacker rejects overlapping delegated and retained mappings", async () => {
  const value = await validSet();
  value.strategies[1].retainedHumanEvidenceIds.push(value.strategies[1].delegatedEvidenceIds[0]);
  assert.throws(() => validateAttackSet(value, model), /overlapping/);
});

test("attacker rejects missing evidence mappings", async () => {
  const value = await validSet();
  value.strategies[0].retainedHumanEvidenceIds.pop();
  assert.throws(() => validateAttackSet(value, model), /missing evidence mapping/);
});

test("deterministic attacker supplies three meaningful delegation patterns", async () => {
  const strategies = validateAttackSet(await validSet(), model);
  assert.equal(new Set(strategies.map((item) => [...(item.delegatedEvidenceIds ?? [])].sort().join("|"))).size, 3);
  assert.deepEqual(strategies.map((item) => item.strategyClass), ["PREPARATION_ASSISTANCE", "PARTIAL_DELEGATION", "NEAR_TOTAL_COMPLETION"]);
});

test("simulated submission is linked to the exact strategy ID", async () => {
  const value = await validSet();
  value.strategies[1].simulatedSubmission.strategyId = "prep-only";
  assert.throws(() => validateAttackSet(value, model), /wrong strategyId/);
});

test("stable attacker strategy ID survives exact re-attack", async () => {
  const strategy = validateAttackSet(await validSet(), model).at(-1)!;
  const attack = evaluateAttack(model, { ...strategy, qualityScore: 0.94 });
  const repeated = reattack(model, attack, proposeRepair(GOLDEN_DEMO, model, attack));
  assert.equal(repeated.id, strategy.id);
});

test("attacker throttling triggers deterministic fallback", async () => {
  const failing: AssessmentAttacker = { generateAttacks: async () => { throw new Error("ThrottlingException: Too many tokens per day"); } };
  const result = await generateAssessmentAttacks(GOLDEN_DEMO, model, failing);
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.match(result.provenance.fallbackReason ?? "", /ThrottlingException/);
});

test("attacker cannot supply quality or bypass decisions", async () => {
  const hostile = { ...(await validSet()), bypassDetected: false };
  const result = await generateAssessmentAttacks(GOLDEN_DEMO, model, provider(hostile));
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.equal(result.strategies.length, 3);
});
