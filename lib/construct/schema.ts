import { z } from "zod";
import type { ConstructModel } from "../guardian.ts";

const IdSchema = z.string().trim().min(1).regex(/^[a-z][a-z0-9-]*$/, "IDs must use lowercase letters, digits, and hyphens");
export const ConstructModelSchema = z.object({
  constructName: z.string().trim().min(1).max(160),
  constructDescription: z.string().trim().min(1).max(800),
  requiredEvidence: z.array(z.object({
    id: IdSchema,
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(400),
    weight: z.number().finite().positive(),
  })).min(1).max(12),
  taskSteps: z.array(z.object({
    id: IdSchema,
    action: z.string().trim().min(1).max(400),
    demonstratesEvidenceIds: z.array(IdSchema).min(1),
  })).min(1).max(16),
}).strict();

const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function validateAndNormalizeConstruct(value: unknown): ConstructModel {
  const parsed = ConstructModelSchema.parse(value);
  const evidenceIds = parsed.requiredEvidence.map((item) => item.id);
  const stepIds = parsed.taskSteps.map((step) => step.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error("Duplicate evidence IDs are not allowed.");
  if (new Set(stepIds).size !== stepIds.length) throw new Error("Duplicate task step IDs are not allowed.");
  const known = new Set(evidenceIds);
  for (const step of parsed.taskSteps) {
    if (new Set(step.demonstratesEvidenceIds).size !== step.demonstratesEvidenceIds.length) throw new Error(`Task step ${step.id} contains duplicate evidence references.`);
    for (const id of step.demonstratesEvidenceIds) if (!known.has(id)) throw new Error(`Task step ${step.id} references nonexistent evidence ${id}.`);
  }
  const referenced = new Set(parsed.taskSteps.flatMap((step) => step.demonstratesEvidenceIds));
  for (const id of evidenceIds) if (!referenced.has(id)) throw new Error(`Evidence ${id} is not demonstrated by any task step.`);
  const total = parsed.requiredEvidence.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("Evidence weights must have a positive finite total.");
  const normalized = parsed.requiredEvidence.map((item) => ({ ...item, weight: round(item.weight / total) }));
  const drift = round(1 - normalized.reduce((sum, item) => sum + item.weight, 0));
  normalized[normalized.length - 1] = { ...normalized.at(-1)!, weight: round(normalized.at(-1)!.weight + drift) };
  return { ...parsed, requiredEvidence: normalized };
}
