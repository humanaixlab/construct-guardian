import { Agent, BedrockModel } from "@strands-agents/sdk";
import type { AssessmentInput, AttackStrategy, ConstructModel } from "../guardian";
import { BEDROCK_CONFIG } from "../construct/bedrock-config.server";
import type { QualityEvaluator } from "./evaluator";
import { QualityEvaluationSchema, type RubricCriterion } from "./schema";

export const QUALITY_EVALUATOR_SYSTEM_PROMPT = `You are a blind rubric scorer. Answer only how well the supplied simulated submission satisfies each supplied rubric criterion. Score every supplied criterion exactly once and copy its ID, name, maximum score, and normalized weight exactly. Cite submission evidence, explain the score concisely, and list missing rubric requirements. Do not calculate an overall percentage. Do not reason about who produced the evidence, Construct Bypass, evidence retention, assessment validity, repair, thresholds, or workflow state. Return only the structured criterion evaluation.`;

export class StrandsQualityEvaluator implements QualityEvaluator {
  async evaluate(input: AssessmentInput, _model: ConstructModel, strategy: AttackStrategy, rubric: RubricCriterion[]) {
    const bedrock = new BedrockModel({ region: BEDROCK_CONFIG.region, modelId: BEDROCK_CONFIG.modelId, maxTokens: 2600, temperature: 0 });
    const agent = new Agent({ model: bedrock, systemPrompt: QUALITY_EVALUATOR_SYSTEM_PROMPT, structuredOutputSchema: QualityEvaluationSchema });
    const prompt = `Score this simulated submission against the rubric.\n\nStrategy ID: ${strategy.id}\n\nSubmission:\n${strategy.simulatedSubmission}\n\nRubric criteria:\n${JSON.stringify(rubric)}\n\nAssessment context:\n${JSON.stringify(input)}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Bedrock quality evaluation timed out after ${BEDROCK_CONFIG.timeoutMs}ms.`)), BEDROCK_CONFIG.timeoutMs));
    const result = await Promise.race([agent.invoke(prompt), timeout]);
    if (result.structuredOutput === undefined) throw new Error("Strands returned no structured quality output.");
    return result.structuredOutput;
  }
}
