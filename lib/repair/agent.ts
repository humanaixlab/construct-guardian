import type { AssessmentInput, AttackResult, ConstructModel, Repair, RepairMechanism, StageProvenance } from "../guardian.ts";
import type { QualityResult } from "../quality/schema.ts";
import { rejectRepairDomainEscalation, validateRepair } from "./schema.ts";

export interface RepairAgent { proposeRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult, quality: QualityResult): Promise<unknown>; }

export function deterministicRepairCandidate(model: ConstructModel, attack: AttackResult) {
  if (!attack.bypassDetected) throw new Error("Repair requires a confirmed construct bypass.");
  const knownEvidenceIds = new Set(model.requiredEvidence.map((item) => item.id));
  const lostEvidenceIds = [...new Set(attack.bypassedEvidenceIds)].filter((id) => knownEvidenceIds.has(id));
  if (!lostEvidenceIds.length) throw new Error("Repair requires at least one bypassed evidence item from the Construct Model.");
  const lost = new Set(lostEvidenceIds);
  const lostItems = model.requiredEvidence.filter((item) => lost.has(item.id));
  const evidenceText = lostItems.map((item) => `${item.id} ${item.label} ${item.description}`.toLowerCase()).join(" ");
  const matches = (pattern: RegExp) => pattern.test(evidenceText);
  const allLostEvidenceIsOral = lostItems.every((item) => /oral|spoken|speaking|pronunciation|presentation|respond live/.test(`${item.id} ${item.label} ${item.description}`.toLowerCase()));
  let repairMechanism: RepairMechanism;
  let repairText: string;
  let whyThisRepairFits: string;
  let addedStudentBurden: string;
  let humanOnlyRequirement = false;
  if (allLostEvidenceIsOral) {
    repairMechanism = "LIVE_ORAL_DEFENSE"; repairText = "Complete a live 3-minute oral check addressing only the identified spoken-performance evidence."; whyThisRepairFits = "The lost evidence is itself live spoken performance, so a brief oral check directly samples the same construct."; addedStudentBurden = "One 3-minute oral check."; humanOnlyRequirement = true;
  } else if (lost.size === model.requiredEvidence.length) {
    repairMechanism = "CONSTRAINED_IN_CLASS_RESPONSE"; repairText = "After submission, complete one 8-minute in-class response to a newly supplied campaign excerpt: identify one strategy, select one quotation, justify the connection, and note one plausible alternative reading."; whyThisRepairFits = "All required evidence was bypassed, so one compact unseen response restores an attributable sample across the complete evidence chain."; addedStudentBurden = "One 8-minute in-class response."; humanOnlyRequirement = true;
  } else if (matches(/select|selection|choose|quotation|textual evidence/) && lost.size === 1) {
    repairMechanism = "STUDENT_SELECTED_UNSEEN_EVIDENCE"; repairText = "Select one relevant quotation from a short excerpt released with the task and add one sentence explaining its relevance."; whyThisRepairFits = "The missing evidence is independent evidence selection, which is observed directly through one new selection rather than a broader defense."; addedStudentBurden = "One quotation and one sentence.";
  } else if (matches(/justify|justification|explain why|reasoning|inference/) && lost.size === 1) {
    repairMechanism = "SHORT_DECISION_JUSTIFICATION"; repairText = "Add 2–3 sentences explaining why one selected quotation supports the named persuasive strategy rather than the closest competing label."; whyThisRepairFits = "The bypass removed the evidence-to-strategy inference, so a focused justification restores that exact reasoning evidence."; addedStudentBurden = "Two to three sentences.";
  } else if (matches(/alternative|counterexample|counter-example|competing interpretation/) && lost.size === 1) {
    repairMechanism = "ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE"; repairText = "State one plausible alternative interpretation of a chosen passage and give one sentence explaining why the preferred interpretation remains stronger."; whyThisRepairFits = "The missing evidence is consideration of an alternative reading, so one bounded alternative directly restores it."; addedStudentBurden = "One alternative and one comparison sentence.";
  } else if (matches(/identify|identification|justify|justification|reasoning|inference/)) {
    repairMechanism = "ANNOTATED_REASONING_ARTIFACT"; repairText = "Attach one annotation linking a chosen passage to the strategy label and the inference used to reach that label; limit the annotation to 75 words."; whyThisRepairFits = "The lost evidence spans an analytical decision and its reasoning, which one bounded annotation exposes without replacing the assignment."; addedStudentBurden = "One annotation of no more than 75 words.";
  } else {
    repairMechanism = "TRACKED_REVISION_WITH_RATIONALE"; repairText = "Revise one marked passage and append a 50-word rationale identifying what changed and which evidence informed the revision."; whyThisRepairFits = "The remaining lost-evidence combination is best recovered through a small visible revision tied to the affected evidence."; addedStudentBurden = "One revision and a rationale of no more than 50 words.";
  }
  return { lostEvidenceIds, targetedEvidenceIds: lostEvidenceIds, repairMechanism, repairText, whyThisRepairFits, minimalityReason: "This appends one bounded evidence requirement and leaves the original prompt, rubric, and all other task components unchanged.", addedStudentBurden, humanOnlyRequirement, attackMechanismAddressed: attack.expectedAttackMechanism ?? attack.aiRole };
}

export class DeterministicRepairAgent implements RepairAgent {
  async proposeRepair(_input: AssessmentInput, model: ConstructModel, attack: AttackResult) { return deterministicRepairCandidate(model, attack); }
}

export function proposeDeterministicRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult): Repair {
  return validateRepair(deterministicRepairCandidate(model, attack), input, model, attack);
}

export type RepairProposal = { repair: Repair; provenance: StageProvenance };
export async function generateRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult, quality: QualityResult, strands: RepairAgent, fallback: RepairAgent = new DeterministicRepairAgent()): Promise<RepairProposal> {
  try {
    const candidate = await strands.proposeRepair(input, model, attack, quality);
    rejectRepairDomainEscalation(candidate);
    return { repair: validateRepair(candidate, input, model, attack), provenance: { provider: "STRANDS_BEDROCK" } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown Strands/Bedrock repair failure";
    const candidate = await fallback.proposeRepair(input, model, attack, quality);
    return { repair: validateRepair(candidate, input, model, attack), provenance: { provider: "DETERMINISTIC_FALLBACK", fallbackReason: reason } };
  }
}
