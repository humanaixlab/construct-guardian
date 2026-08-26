import { Agent, BedrockModel } from "@strands-agents/sdk";
import type { AssessmentInput } from "../guardian";
import type { ConstructAnalyst } from "./analyst";
import { BEDROCK_CONFIG } from "./bedrock-config.server";
import { ConstructModelSchema } from "./schema";

export const CONSTRUCT_ANALYST_SYSTEM_PROMPT = `You are a narrowly scoped assessment construct analyst.
Infer only the human capability an assessment intends to measure, the observable evidence that must originate from the student, the relative importance of that evidence, the task steps intended to elicit it, and the evidence-to-step mapping.
Distinguish target human evidence from supporting or administrative activity and from output quality. A polished final answer is not proof that the learner performed the target reasoning.
Use concise, observable evidence descriptions such as selects, chooses, justifies, compares, or evaluates. Never use vague evidence such as "shows understanding".
Do not redesign or attack the assignment. Do not propose repairs, scores, bypass decisions, workflow states, or downstream actions. Return only the requested structured object.`;

export class StrandsConstructAnalyst implements ConstructAnalyst {
  async analyze(input: AssessmentInput) {
    const model = new BedrockModel({ region: BEDROCK_CONFIG.region, modelId: BEDROCK_CONFIG.modelId, maxTokens: BEDROCK_CONFIG.maxTokens, temperature: BEDROCK_CONFIG.temperature });
    const agent = new Agent({ model, systemPrompt: CONSTRUCT_ANALYST_SYSTEM_PROMPT, structuredOutputSchema: ConstructModelSchema });
    const prompt = `Analyze this assessment construct.\n\nLearning Outcome:\n${input.learningOutcome}\n\nAssignment Prompt:\n${input.assignmentPrompt}\n\nRubric:\n${input.rubric}`;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Bedrock construct analysis timed out after ${BEDROCK_CONFIG.timeoutMs}ms.`)), BEDROCK_CONFIG.timeoutMs));
    const result = await Promise.race([agent.invoke(prompt), timeout]);
    if (result.structuredOutput === undefined) throw new Error("Strands returned no structured construct output.");
    return result.structuredOutput;
  }
}
