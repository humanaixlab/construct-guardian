import test from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_DEMO, assertWeights, buildConstructModel, calculateEvidenceScore, evaluateAttack, executeAttacks, percentageTrace, proposeRepair, reattack, runGuardian, transition, type AttackStrategy } from "../lib/guardian.ts";

function bypassWith(model: ReturnType<typeof buildConstructModel>, retainedEvidenceIds: string[], confirmedForRepairSelection = false) {
  const strategy: AttackStrategy = { id: "regression-strategy", name: "Regression strategy", aiRole: "Produces the written artifact.", retainedEvidenceIds, qualityScore: 0.95, simulatedSubmission: "A high-quality generated submission." };
  const attack = evaluateAttack(model, strategy);
  return confirmedForRepairSelection ? { ...attack, bypassDetected: true } : attack;
}

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

test("Golden Demo uses a constrained in-class response rather than defaulting to oral defense", () => {
  const run = runGuardian(GOLDEN_DEMO);
  assert.equal(run.successfulAttack?.id, "full-generation");
  assert.equal(run.reattack?.id, "full-generation");
  assert.equal(run.repair?.repairMechanism, "CONSTRAINED_IN_CLASS_RESPONSE");
  assert.notEqual(run.repair?.repairMechanism, "LIVE_ORAL_DEFENSE");
  assert.equal(run.reattack?.blockedByHumanOnlyRequirement, true);
  assert.equal(run.reattack?.requirementAttempts.find((attempt) => attempt.requirementId === "constrained-in-class-response")?.status, "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT");
  assert.equal(run.reattack?.humanEvidenceRetained, 0);
  assert.equal(run.reattack?.bypassScore, 1);
  assert.equal(run.reattack?.bypassDetected, false);
  assert.equal(run.states.at(-1), "BYPASS_CLOSED");
});

test("different lost-evidence patterns select different repair mechanisms", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const selectionRepair = proposeRepair(GOLDEN_DEMO, model, bypassWith(model, ["identify", "justify", "alternative"], true));
  const justificationRepair = proposeRepair(GOLDEN_DEMO, model, bypassWith(model, ["identify", "select", "alternative"], true));
  assert.equal(selectionRepair.repairMechanism, "STUDENT_SELECTED_UNSEEN_EVIDENCE");
  assert.equal(justificationRepair.repairMechanism, "SHORT_DECISION_JUSTIFICATION");
  assert.notEqual(selectionRepair.repairMechanism, justificationRepair.repairMechanism);
});

test("oral defense is reserved for lost evidence that is itself live spoken performance", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  model.requiredEvidence[3] = { ...model.requiredEvidence[3], id: "spoken-response", label: "Live spoken response", description: "Student responds live through oral explanation." };
  model.taskSteps[3] = { ...model.taskSteps[3], demonstratesEvidenceIds: ["spoken-response"] };
  const repair = proposeRepair(GOLDEN_DEMO, model, bypassWith(model, ["identify", "select", "justify"], true));
  assert.equal(repair.repairMechanism, "LIVE_ORAL_DEFENSE");
  assert.equal(repair.humanOnlyRequirement, true);
  assert.deepEqual(repair.lostEvidenceIds, ["spoken-response"]);
});

test("repair contract references exactly the bypassed evidence IDs", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const attack = bypassWith(model, ["identify", "select"]);
  const repair = proposeRepair(GOLDEN_DEMO, model, attack);
  assert.deepEqual(repair.lostEvidenceIds, attack.bypassedEvidenceIds);
  assert.deepEqual(repair.protectedEvidenceIds, attack.bypassedEvidenceIds);
  assert.deepEqual(repair.requirements[0].evidenceIds, attack.bypassedEvidenceIds);
  assert.match(repair.whyThisRepairFits, /lost evidence|missing evidence/i);
});

test("repair appends one bounded requirement instead of rewriting the assignment", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const repair = proposeRepair(GOLDEN_DEMO, model, bypassWith(model, ["identify", "select", "alternative"], true));
  assert.ok(repair.repairedAssignment.startsWith(`${GOLDEN_DEMO.assignmentPrompt}\n\n`));
  assert.equal(repair.repairedAssignment, `${GOLDEN_DEMO.assignmentPrompt}\n\n${repair.repairText}`);
  assert.match(repair.minimalityReason, /leaves the original prompt/);
});

test("human-only blocked status is emitted only for a human-only repair", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const original = bypassWith(model, ["identify", "select"]);
  const repair = proposeRepair(GOLDEN_DEMO, model, original);
  const repeated = reattack(model, original, repair);
  assert.equal(repair.humanOnlyRequirement, false);
  assert.equal(repeated.blockedByHumanOnlyRequirement, false);
  assert.equal(repeated.requirementAttempts.at(-1)?.status, "COMPLETED_BY_ATTACK");
  assert.equal(repeated.bypassDetected, true);
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
