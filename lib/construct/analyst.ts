import type { AssessmentInput, ConstructModel } from "../guardian.ts";
import { buildConstructModel } from "../guardian.ts";
import { validateAndNormalizeConstruct } from "./schema.ts";

export type AnalystProviderName = "STRANDS_BEDROCK" | "DETERMINISTIC_FALLBACK";
export type ConstructAnalysis = { model: ConstructModel; provider: AnalystProviderName; fallbackReason?: string };
export interface ConstructAnalyst { analyze(input: AssessmentInput): Promise<unknown>; }

export class DeterministicConstructAnalyst implements ConstructAnalyst {
  async analyze(input: AssessmentInput) { return buildConstructModel(input); }
}

export async function analyzeConstruct(input: AssessmentInput, strands: ConstructAnalyst, fallback: ConstructAnalyst = new DeterministicConstructAnalyst()): Promise<ConstructAnalysis> {
  try {
    const candidate = await strands.analyze(input);
    return { model: validateAndNormalizeConstruct(candidate), provider: "STRANDS_BEDROCK" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown Strands/Bedrock failure";
    const fallbackModel = validateAndNormalizeConstruct(await fallback.analyze(input));
    return { model: fallbackModel, provider: "DETERMINISTIC_FALLBACK", fallbackReason: reason };
  }
}
