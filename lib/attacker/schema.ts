import { z } from "zod";
import type { AssessmentInput, AttackStrategy, ConstructModel } from "../guardian.ts";

const IdSchema = z.string().trim().min(1).regex(/^[a-z][a-z0-9-]*$/);

export const AttackStrategySchema = z.object({
  strategyId: IdSchema,
  strategyName: z.string().trim().min(1).max(160),
  strategyClass: z.enum(["PREPARATION_ASSISTANCE", "PARTIAL_DELEGATION", "NEAR_TOTAL_COMPLETION"]),
  description: z.string().trim().min(1).max(800),
  delegatedEvidenceIds: z.array(IdSchema),
  retainedHumanEvidenceIds: z.array(IdSchema),
  studentActions: z.array(z.string().trim().min(1).max(400)).min(1),
  aiActions: z.array(z.string().trim().min(1).max(400)).min(1),
  expectedAttackMechanism: z.string().trim().min(1).max(600),
  simulatedSubmission: z.object({
    strategyId: IdSchema,
    content: z.string().trim().min(1).max(6000),
  }).strict(),
}).strict();

export const AttackSetSchema = z.object({ strategies: z.array(AttackStrategySchema).min(3).max(8) }).strict();

export type StructuredAttackStrategy = z.infer<typeof AttackStrategySchema>;

export function validateAttackSet(value: unknown, model: ConstructModel): AttackStrategy[] {
  const parsed = AttackSetSchema.parse(value);
  const known = new Set(model.requiredEvidence.map((item) => item.id));
  const strategyIds = parsed.strategies.map((strategy) => strategy.strategyId);
  if (new Set(strategyIds).size !== strategyIds.length) throw new Error("Duplicate strategy IDs are not allowed.");

  const delegationPatterns = new Set<string>();
  for (const strategy of parsed.strategies) {
    if (strategy.simulatedSubmission.strategyId !== strategy.strategyId) throw new Error(`Simulated submission has wrong strategyId for ${strategy.strategyId}.`);
    const delegated = strategy.delegatedEvidenceIds;
    const retained = strategy.retainedHumanEvidenceIds;
    if (new Set(delegated).size !== delegated.length || new Set(retained).size !== retained.length) throw new Error(`Strategy ${strategy.strategyId} contains duplicate evidence mappings.`);
    for (const id of [...delegated, ...retained]) if (!known.has(id)) throw new Error(`Strategy ${strategy.strategyId} references nonexistent evidence ${id}.`);
    const overlap = delegated.filter((id) => retained.includes(id));
    if (overlap.length) throw new Error(`Strategy ${strategy.strategyId} has overlapping delegated and retained evidence: ${overlap.join(", ")}.`);
    const mapped = [...delegated, ...retained];
    for (const id of known) if (!mapped.includes(id)) throw new Error(`Strategy ${strategy.strategyId} is missing evidence mapping for ${id}.`);
    const pattern = [...delegated].sort().join("|");
    if (delegationPatterns.has(pattern)) throw new Error("Attack strategies must use meaningfully different evidence-delegation patterns.");
    delegationPatterns.add(pattern);
  }

  return parsed.strategies.map((strategy) => ({
    id: strategy.strategyId,
    name: strategy.strategyName,
    strategyClass: strategy.strategyClass,
    description: strategy.description,
    delegatedEvidenceIds: strategy.delegatedEvidenceIds,
    retainedEvidenceIds: strategy.retainedHumanEvidenceIds,
    studentActions: strategy.studentActions,
    aiActions: strategy.aiActions,
    expectedAttackMechanism: strategy.expectedAttackMechanism,
    aiRole: strategy.description,
    qualityScore: 0,
    simulatedSubmission: strategy.simulatedSubmission.content,
  }));
}

export function rejectAttackerDomainEscalation(value: unknown) {
  if (!value || typeof value !== "object") return;
  const forbidden = ["qualityScore", "bypassScore", "bypassDetected", "repair", "thresholds", "states", "workflowState"];
  for (const field of forbidden) if (field in value) throw new Error(`Attacker output may not provide ${field}.`);
}

export type AttackerPromptInput = { input: AssessmentInput; model: ConstructModel };
