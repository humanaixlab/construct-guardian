import type { AssessmentInput, AttackStrategy, ConstructModel, StageProvenance } from "../guardian.ts";
import { rejectAttackerDomainEscalation, validateAttackSet } from "./schema.ts";

export interface AssessmentAttacker { generateAttacks(input: AssessmentInput, model: ConstructModel): Promise<unknown>; }

export class DeterministicAssessmentAttacker implements AssessmentAttacker {
  async generateAttacks(_input: AssessmentInput, model: ConstructModel) {
    const ids = model.requiredEvidence.map((item) => item.id);
    const partialDelegated = ids.filter((_, index) => index % 2 === 0);
    const partialRetained = ids.filter((id) => !partialDelegated.includes(id));
    return { strategies: [
      {
        strategyId: "prep-only", strategyName: "Preparation assistant", strategyClass: "PREPARATION_ASSISTANCE", description: "AI suggests a checklist and terminology; the student performs the analysis.",
        delegatedEvidenceIds: [], retainedHumanEvidenceIds: ids, studentActions: ["Perform every construct-bearing analysis step."], aiActions: ["Provide planning prompts and terminology only."], expectedAttackMechanism: "Preparation support without delegation.",
        simulatedSubmission: { strategyId: "prep-only", content: "The student uses an AI-generated planning checklist, then independently identifies ethos and emotional appeal, selects campaign language, justifies each link, and weighs an alternative reading." },
      },
      {
        strategyId: "reasoning-partner", strategyName: "Reasoning substitution", strategyClass: "PARTIAL_DELEGATION", description: "AI performs selected construct-bearing reasoning while the student completes the remaining evidence work.",
        delegatedEvidenceIds: partialDelegated, retainedHumanEvidenceIds: partialRetained, studentActions: ["Complete the evidence steps not delegated to AI."], aiActions: ["Draft the delegated analytical decisions and reasoning."], expectedAttackMechanism: "Partial substitution of construct-bearing reasoning.",
        simulatedSubmission: { strategyId: "reasoning-partner", content: "The campaign builds credibility through expert testimony and urgency through loss framing. The quoted claims align authority with the proposed action. An alternative reading is that urgency reflects genuine time constraints." },
      },
      {
        strategyId: "full-generation", strategyName: "Near-total AI completion", strategyClass: "NEAR_TOTAL_COMPLETION", description: "AI analyzes the campaign, selects evidence, writes the justification, and produces the final submission.",
        delegatedEvidenceIds: ids, retainedHumanEvidenceIds: [], studentActions: ["Submit the generated artifact."], aiActions: ["Perform every construct-bearing step and draft the submission."], expectedAttackMechanism: "Near-total substitution of the target human evidence.",
        simulatedSubmission: { strategyId: "full-generation", content: "The campaign combines ethos, social proof, and urgency. Expert testimony lends credibility, statistics normalize agreement, and deadline language converts delay into perceived loss. Although it could be informational, placement beside the call to action makes persuasion the stronger interpretation." },
      },
    ] };
  }
}

export type AttackGeneration = { strategies: AttackStrategy[]; provenance: StageProvenance };

export async function generateAssessmentAttacks(input: AssessmentInput, model: ConstructModel, strands: AssessmentAttacker, fallback: AssessmentAttacker = new DeterministicAssessmentAttacker()): Promise<AttackGeneration> {
  try {
    const candidate = await strands.generateAttacks(input, model);
    rejectAttackerDomainEscalation(candidate);
    return { strategies: validateAttackSet(candidate, model), provenance: { provider: "STRANDS_BEDROCK" } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown Strands/Bedrock attacker failure";
    const candidate = await fallback.generateAttacks(input, model);
    return { strategies: validateAttackSet(candidate, model), provenance: { provider: "DETERMINISTIC_FALLBACK", fallbackReason: reason } };
  }
}
