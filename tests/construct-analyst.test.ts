import test from "node:test";
import assert from "node:assert/strict";
import { analyzeConstruct, type ConstructAnalyst } from "../lib/construct/analyst.ts";
import { validateAndNormalizeConstruct } from "../lib/construct/schema.ts";
import { GOLDEN_DEMO, buildConstructModel, runGuardian } from "../lib/guardian.ts";

const validStructuredOutput = {
  constructName: "Independent persuasive analysis",
  constructDescription: GOLDEN_DEMO.learningOutcome,
  requiredEvidence: [
    { id: "identify", label: "Strategy identification", description: "Selects a persuasive strategy independently.", weight: 2 },
    { id: "select", label: "Evidence selection", description: "Chooses relevant textual evidence.", weight: 3 },
    { id: "justify", label: "Evidence justification", description: "Justifies why evidence supports the interpretation.", weight: 3 },
    { id: "alternative", label: "Alternative interpretation", description: "Evaluates an alternative interpretation.", weight: 2 },
  ],
  taskSteps: [
    { id: "step-1", action: "Identify a strategy.", demonstratesEvidenceIds: ["identify"] },
    { id: "step-2", action: "Select evidence.", demonstratesEvidenceIds: ["select"] },
    { id: "step-3", action: "Justify the relationship.", demonstratesEvidenceIds: ["justify"] },
    { id: "step-4", action: "Evaluate an alternative.", demonstratesEvidenceIds: ["alternative"] },
  ],
};

const provider = (value: unknown): ConstructAnalyst => ({ analyze: async () => value });

test("valid Strands-style structured Construct output is accepted and normalized", async () => {
  const result = await analyzeConstruct(GOLDEN_DEMO, provider(validStructuredOutput));
  assert.equal(result.provider, "STRANDS_BEDROCK");
  assert.equal(result.model.requiredEvidence.reduce((sum, item) => sum + item.weight, 0), 1);
});

test("malformed structured output is rejected", () => {
  assert.throws(() => validateAndNormalizeConstruct({ constructName: "Incomplete" }));
});

test("invalid evidence references trigger deterministic fallback", async () => {
  const invalid = structuredClone(validStructuredOutput);
  invalid.taskSteps[0].demonstratesEvidenceIds = ["missing-evidence"];
  const result = await analyzeConstruct(GOLDEN_DEMO, provider(invalid));
  assert.equal(result.provider, "DETERMINISTIC_FALLBACK");
  assert.match(result.fallbackReason ?? "", /nonexistent evidence/);
});

test("Bedrock failure triggers deterministic fallback", async () => {
  const failing: ConstructAnalyst = { analyze: async () => { throw new Error("Bedrock unavailable"); } };
  const result = await analyzeConstruct(GOLDEN_DEMO, failing);
  assert.equal(result.provider, "DETERMINISTIC_FALLBACK");
  assert.equal(result.fallbackReason, "Bedrock unavailable");
});

test("fallback preserves the complete Golden Demo", async () => {
  const result = await analyzeConstruct(GOLDEN_DEMO, provider("malformed"));
  const run = runGuardian(GOLDEN_DEMO, result.model, { provider: result.provider, fallbackReason: result.fallbackReason });
  assert.deepEqual(run.states, ["INGESTED", "CONSTRUCT_MODELED", "ATTACK_EXECUTED", "BYPASS_CONFIRMED", "REPAIR_PROPOSED", "REATTACKED", "BYPASS_CLOSED"]);
  assert.equal(run.reattack?.requirementAttempts.at(-1)?.status, "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT");
});

test("downstream bypass calculations are identical for the same Construct Model", () => {
  const model = buildConstructModel(GOLDEN_DEMO);
  const deterministic = runGuardian(GOLDEN_DEMO, model, { provider: "DETERMINISTIC_FALLBACK" });
  const strands = runGuardian(GOLDEN_DEMO, model, { provider: "STRANDS_BEDROCK" });
  assert.deepEqual(strands.attacks.map(({ humanEvidenceRetained, bypassScore, bypassDetected }) => ({ humanEvidenceRetained, bypassScore, bypassDetected })), deterministic.attacks.map(({ humanEvidenceRetained, bypassScore, bypassDetected }) => ({ humanEvidenceRetained, bypassScore, bypassDetected })));
});

test("Strands output cannot mutate workflow state or bypass scoring", async () => {
  const hostile = { ...validStructuredOutput, states: ["BYPASS_CLOSED"], bypassScore: 0 };
  const analysis = await analyzeConstruct(GOLDEN_DEMO, provider(hostile));
  assert.equal(analysis.provider, "DETERMINISTIC_FALLBACK");
  const run = runGuardian(GOLDEN_DEMO, analysis.model, { provider: analysis.provider, fallbackReason: analysis.fallbackReason });
  assert.equal(run.successfulAttack?.bypassScore, 1);
  assert.equal(run.states.at(-1), "BYPASS_CLOSED");
});
