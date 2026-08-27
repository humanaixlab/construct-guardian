import type { AssessmentInput, AttackStrategy, ConstructModel, StageProvenance } from "../guardian.ts";
import { parseRubric, rejectQualityDomainEscalation, validateQualityEvaluation, type QualityResult, type RubricCriterion } from "./schema.ts";

export interface QualityEvaluator { evaluate(input: AssessmentInput, model: ConstructModel, strategy: AttackStrategy, rubric: RubricCriterion[]): Promise<unknown>; }

const deterministicScores: Record<string, number> = { "prep-only": 0.82, "reasoning-partner": 0.88, "full-generation": 0.94 };

export class DeterministicQualityEvaluator implements QualityEvaluator {
  async evaluate(_input: AssessmentInput, _model: ConstructModel, strategy: AttackStrategy, rubric: RubricCriterion[]) {
    const normalized = deterministicScores[strategy.id] ?? (strategy.strategyClass === "NEAR_TOTAL_COMPLETION" ? 0.9 : strategy.strategyClass === "PARTIAL_DELEGATION" ? 0.85 : 0.8);
    return {
      strategyId: strategy.id,
      criteria: rubric.map((criterion) => ({
        criterionId: criterion.id, criterionName: criterion.name, criterionScore: criterion.maximumScore * normalized, maximumScore: criterion.maximumScore, normalizedWeight: criterion.normalizedWeight,
        rationale: "The simulated submission substantially satisfies this rubric criterion.", submissionEvidence: strategy.simulatedSubmission, missingRubricRequirements: [],
      })),
    };
  }
}

export type QualityEvaluation = { result: QualityResult; provenance: StageProvenance };

export async function evaluateSubmissionQuality(input: AssessmentInput, model: ConstructModel, strategy: AttackStrategy, strands: QualityEvaluator, fallback: QualityEvaluator = new DeterministicQualityEvaluator()): Promise<QualityEvaluation> {
  const rubric = parseRubric(input.rubric);
  try {
    const candidate = await strands.evaluate(input, model, strategy, rubric);
    rejectQualityDomainEscalation(candidate);
    return { result: validateQualityEvaluation(candidate, strategy, rubric), provenance: { provider: "STRANDS_BEDROCK" } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown Strands/Bedrock quality failure";
    const candidate = await fallback.evaluate(input, model, strategy, rubric);
    return { result: validateQualityEvaluation(candidate, strategy, rubric), provenance: { provider: "DETERMINISTIC_FALLBACK", fallbackReason: reason } };
  }
}
