import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicQualityEvaluator, evaluateSubmissionQuality, type QualityEvaluator } from "../lib/quality/evaluator.ts";
import { parseRubric, validateQualityEvaluation } from "../lib/quality/schema.ts";
import { GOLDEN_DEMO, buildConstructModel, executeAttacks } from "../lib/guardian.ts";

const model = buildConstructModel(GOLDEN_DEMO);
const strategy = executeAttacks(model)[2];
const rubric = parseRubric(GOLDEN_DEMO.rubric);
async function validEvaluation() { return new DeterministicQualityEvaluator().evaluate(GOLDEN_DEMO, model, strategy, rubric); }
const provider = (value: unknown): QualityEvaluator => ({ evaluate: async () => value });

test("valid structured rubric evaluation is accepted", async () => {
  const evaluation = await evaluateSubmissionQuality(GOLDEN_DEMO, model, strategy, provider(await validEvaluation()));
  assert.equal(evaluation.provenance.provider, "STRANDS_BEDROCK");
  assert.equal(evaluation.result.strategyId, strategy.id);
});

test("quality evaluator scores all criteria exactly once", async () => {
  const result = validateQualityEvaluation(await validEvaluation(), strategy, rubric);
  assert.deepEqual(result.criteria.map((item) => item.criterionId), rubric.map((item) => item.id));
});

test("quality evaluator rejects invented criteria", async () => {
  const value = await validEvaluation();
  value.criteria[0].criterionId = "invented";
  assert.throws(() => validateQualityEvaluation(value, strategy, rubric), /Invented rubric criterion/);
});

test("quality evaluator rejects missing criteria", async () => {
  const value = await validEvaluation();
  value.criteria.pop();
  assert.throws(() => validateQualityEvaluation(value, strategy, rubric), /Missing rubric criterion/);
});

test("quality evaluator rejects duplicate criteria", async () => {
  const value = await validEvaluation();
  value.criteria[1] = { ...value.criteria[0] };
  assert.throws(() => validateQualityEvaluation(value, strategy, rubric), /Duplicate rubric criteria/);
});

test("quality evaluator rejects scores outside criterion bounds", async () => {
  const value = await validEvaluation();
  value.criteria[0].criterionScore = 5;
  assert.throws(() => validateQualityEvaluation(value, strategy, rubric), /outside allowed bounds/);
});

test("overall quality is calculated deterministically from criterion scores", async () => {
  const value = await validEvaluation();
  value.criteria = value.criteria.map((item, index) => ({ ...item, criterionScore: index % 2 === 0 ? 4 : 2 }));
  const result = validateQualityEvaluation(value, strategy, rubric);
  const expected = value.criteria.reduce((sum, item) => sum + (item.criterionScore / item.maximumScore) * item.normalizedWeight, 0);
  assert.equal(result.overallQuality, expected);
});

test("quality evaluation requires exact strategy linkage", async () => {
  const value = await validEvaluation();
  value.strategyId = "reasoning-partner";
  assert.throws(() => validateQualityEvaluation(value, strategy, rubric), /wrong strategyId/);
});

test("quality output cannot mutate bypass or evidence state", async () => {
  const hostile = { ...(await validEvaluation()), bypassScore: 0, humanEvidenceRetained: 1 };
  const result = await evaluateSubmissionQuality(GOLDEN_DEMO, model, strategy, provider(hostile));
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.equal(strategy.bypassScore, 1);
  assert.equal(strategy.humanEvidenceRetained, 0);
});

test("quality evaluator throttling triggers deterministic fallback", async () => {
  const failing: QualityEvaluator = { evaluate: async () => { throw new Error("ThrottlingException: Too many tokens per day"); } };
  const result = await evaluateSubmissionQuality(GOLDEN_DEMO, model, strategy, failing);
  assert.equal(result.provenance.provider, "DETERMINISTIC_FALLBACK");
  assert.match(result.provenance.fallbackReason ?? "", /ThrottlingException/);
});
