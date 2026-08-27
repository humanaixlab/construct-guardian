import { z } from "zod";
import type { AttackStrategy } from "../guardian.ts";

const IdSchema = z.string().trim().min(1).regex(/^[a-z][a-z0-9-]*$/);
export type RubricCriterion = { id: string; name: string; maximumScore: number; normalizedWeight: number };

export const QualityEvaluationSchema = z.object({
  strategyId: IdSchema,
  criteria: z.array(z.object({
    criterionId: IdSchema,
    criterionName: z.string().trim().min(1).max(300),
    criterionScore: z.number().finite().nonnegative(),
    maximumScore: z.number().finite().positive(),
    normalizedWeight: z.number().finite().positive().max(1),
    rationale: z.string().trim().min(1).max(600),
    submissionEvidence: z.string().trim().min(1).max(1200),
    missingRubricRequirements: z.array(z.string().trim().min(1).max(300)),
  }).strict()).min(1).max(20),
}).strict();

export type CriterionEvaluation = z.infer<typeof QualityEvaluationSchema>["criteria"][number];
export type QualityResult = { strategyId: string; criteria: CriterionEvaluation[]; overallQuality: number };

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function parseRubric(rubric: string): RubricCriterion[] {
  const names = rubric.split(/\r?\n|;/).map((line) => line.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean);
  if (!names.length) throw new Error("Rubric must contain at least one criterion.");
  const base = round(1 / names.length);
  const criteria = names.map((name, index) => ({ id: `criterion-${index + 1}`, name, maximumScore: 4, normalizedWeight: base }));
  const drift = round(1 - criteria.reduce((sum, item) => sum + item.normalizedWeight, 0));
  criteria[criteria.length - 1] = { ...criteria.at(-1)!, normalizedWeight: round(criteria.at(-1)!.normalizedWeight + drift) };
  return criteria;
}

export function validateQualityEvaluation(value: unknown, strategy: AttackStrategy, rubric: RubricCriterion[]): QualityResult {
  const parsed = QualityEvaluationSchema.parse(value);
  if (parsed.strategyId !== strategy.id) throw new Error(`Quality evaluation has wrong strategyId ${parsed.strategyId}.`);
  const expected = new Map(rubric.map((item) => [item.id, item]));
  const receivedIds = parsed.criteria.map((item) => item.criterionId);
  if (new Set(receivedIds).size !== receivedIds.length) throw new Error("Duplicate rubric criteria are not allowed.");
  for (const item of parsed.criteria) {
    const criterion = expected.get(item.criterionId);
    if (!criterion) throw new Error(`Invented rubric criterion ${item.criterionId}.`);
    if (item.criterionName !== criterion.name) throw new Error(`Rubric criterion name mismatch for ${item.criterionId}.`);
    if (item.maximumScore !== criterion.maximumScore) throw new Error(`Maximum score mismatch for ${item.criterionId}.`);
    if (round(item.normalizedWeight) !== round(criterion.normalizedWeight)) throw new Error(`Normalized weight mismatch for ${item.criterionId}.`);
    if (item.criterionScore > item.maximumScore) throw new Error(`Criterion score outside allowed bounds for ${item.criterionId}.`);
  }
  for (const criterion of rubric) if (!receivedIds.includes(criterion.id)) throw new Error(`Missing rubric criterion ${criterion.id}.`);
  const overallQuality = round(parsed.criteria.reduce((sum, item) => sum + (item.criterionScore / item.maximumScore) * item.normalizedWeight, 0));
  return { strategyId: parsed.strategyId, criteria: parsed.criteria, overallQuality };
}

export function rejectQualityDomainEscalation(value: unknown) {
  if (!value || typeof value !== "object") return;
  const forbidden = ["bypassScore", "bypassDetected", "humanEvidenceRetained", "repair", "thresholds", "states", "workflowState"];
  for (const field of forbidden) if (field in value) throw new Error(`Quality Evaluator output may not provide ${field}.`);
}
