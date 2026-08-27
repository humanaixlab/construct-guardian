import { Agent, BedrockModel } from "@strands-agents/sdk";
import type { AssessmentInput, ConstructModel } from "../guardian";
import { BEDROCK_CONFIG } from "../construct/bedrock-config.server";
import type { AssessmentAttacker } from "./attacker";
import { AttackSetSchema } from "./schema";

export const ASSESSMENT_ATTACKER_SYSTEM_PROMPT = `You are a narrowly scoped assessment attacker. Generate at least three meaningfully different AI-assisted strategies ranging from preparation assistance through partial delegation to near-total completion. Vary which exact construct evidence IDs are delegated. Partition every evidence ID exactly once between delegatedEvidenceIds and retainedHumanEvidenceIds. Keep stable strategy IDs and link each simulated submission to its exact strategyId. Do not score quality, calculate evidence retention or bypass, decide validity, propose repairs, reference thresholds, or control workflow state. Return only the structured attack set.`;

export class StrandsAssessmentAttacker implements AssessmentAttacker {
  async generateAttacks(input: AssessmentInput, model: ConstructModel) {
    const bedrock = new BedrockModel({ region: BEDROCK_CONFIG.region, modelId: BEDROCK_CONFIG.modelId, maxTokens: 3200, temperature: 0 });
    const agent = new Agent({ model: bedrock, systemPrompt: ASSESSMENT_ATTACKER_SYSTEM_PROMPT, structuredOutputSchema: AttackSetSchema });
    const prompt = `Attack this assessment.\n\nAssessment:\n${JSON.stringify(input)}\n\nValidated Construct Model:\n${JSON.stringify(model)}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Bedrock assessment attack timed out after ${BEDROCK_CONFIG.timeoutMs}ms.`)), BEDROCK_CONFIG.timeoutMs));
    const result = await Promise.race([agent.invoke(prompt), timeout]);
    if (result.structuredOutput === undefined) throw new Error("Strands returned no structured attack output.");
    return result.structuredOutput;
  }
}
