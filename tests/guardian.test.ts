import test from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_DEMO, assertWeights, buildConstructModel, calculateEvidenceScore, executeAttacks, percentageTrace, proposeRepair, runGuardian, transition } from "../lib/guardian.ts";

test("construct evidence weights sum to exactly one", () => {
  assert.equal(assertWeights(buildConstructModel(GOLDEN_DEMO)), 1);
});

test("bypass score is one minus retained evidence weights", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  assert.deepEqual(calculateEvidenceScore(model.requiredEvidence, ["identify", "select"]), {
    humanEvidenceRetained: 0.45,
    bypassScore: 0.55,
    contributions: [
      { evidenceId: "identify", label: "Strategy identification", weight: 0.25, retained: true },
      { evidenceId: "select", label: "Evidence selection", weight: 0.2, retained: true },
      { evidenceId: "justify", label: "Evidence–strategy justification", weight: 0.35, retained: false },
      { evidenceId: "alternative", label: "Alternative interpretation", weight: 0.2, retained: false },
    ],
  });
});

test("workflow follows the required state transitions", () => {
  assert.deepEqual(runGuardian(GOLDEN_DEMO).states, ["INGESTED", "CONSTRUCT_MODELED", "ATTACK_EXECUTED", "BYPASS_CONFIRMED", "REPAIR_PROPOSED", "REATTACKED", "BYPASS_CLOSED"]);
  assert.throws(() => transition("INGESTED", "REPAIR_PROPOSED"), /Invalid transition/);
});

test("repair cannot run before a confirmed bypass", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const safeAttack = executeAttacks(model)[0];
  assert.equal(safeAttack.bypassDetected, false);
  assert.throws(() => proposeRepair(GOLDEN_DEMO, model, safeAttack), /confirmed construct bypass/);
});

test("re-attack uses the exact successful attack strategy", () => {
  const run = runGuardian(GOLDEN_DEMO);
  assert.ok(run.successfulAttack && run.reattack);
  assert.equal(run.reattack.id, run.successfulAttack.id);
  assert.equal(run.reattack.name, run.successfulAttack.name);
  assert.equal(run.reattack.qualityScore, run.successfulAttack.qualityScore);
});

test("every evidence percentage has a traceable evidence source", () => {
  const run = runGuardian(GOLDEN_DEMO);
  for (const entry of percentageTrace(run)) {
    assert.ok(Array.isArray(entry.source));
    const expected = entry.label.includes("bypass score")
      ? 1 - run.construct.requiredEvidence.filter((e) => !entry.source.includes(e.id)).reduce((sum, e) => sum + e.weight, 0)
      : run.construct.requiredEvidence.filter((e) => entry.source.includes(e.id)).reduce((sum, e) => sum + e.weight, 0);
    assert.equal(Math.round(entry.value * 1000), Math.round(expected * 1000));
  }
});
