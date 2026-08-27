import { Agent, BedrockModel } from "@strands-agents/sdk";
import type { AssessmentInput, AttackResult, ConstructModel } from "../guardian";
import { BEDROCK_CONFIG } from "../construct/bedrock-config.server";
import type { QualityResult } from "../quality/schema";
import type { RepairAgent } from "./agent";
import { StructuredRepairSchema } from "./schema";

export const REPAIR_AGENT_SYSTEM_PROMPT = `You are a narrowly scoped assessment repair agent. Restore the specific human evidence lost in the confirmed successful attack using the smallest defensible change. Preserve the original learning outcome, assignment, and rubric, appending one bounded evidence requirement wherever possible. Oral defense is not the default. Use live oral defense only for genuinely spoken-performance evidence or with an explicit valid no-lower-burden justification. Only constrained in-class response or live oral defense may be human-only, and only when the same AI-only exploit truly cannot complete it. Do not decide whether the repair succeeds, calculate scores, change thresholds, or control workflow state. Return only the structured repair.`;

export class StrandsRepairAgent implements RepairAgent {
  async proposeRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult, quality: QualityResult) {
    const bedrock = new BedrockModel({ region: BEDROCK_CONFIG.region, modelId: BEDROCK_CONFIG.modelId, maxTokens: 2200, temperature: 0 });
    const agent = new Agent({ model: bedrock, systemPrompt: REPAIR_AGENT_SYSTEM_PROMPT, structuredOutputSchema: StructuredRepairSchema });
    const prompt = `Propose the smallest evidence-targeted repair.\n\nAssessment:\n${JSON.stringify(input)}\n\nConstruct Model:\n${JSON.stringify(model)}\n\nExact successful attack:\n${JSON.stringify(attack)}\n\nBlind rubric evaluation:\n${JSON.stringify(quality)}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Bedrock repair proposal timed out after ${BEDROCK_CONFIG.timeoutMs}ms.`)), BEDROCK_CONFIG.timeoutMs));
    const result = await Promise.race([agent.invoke(prompt), timeout]);
    if (result.structuredOutput === undefined) throw new Error("Strands returned no structured repair output.");
    return result.structuredOutput;
  }
}
