import { z } from "zod";
import type { AssessmentInput, AttackResult, ConstructModel, Repair, RepairMechanism } from "../guardian.ts";

const IdSchema = z.string().trim().min(1).regex(/^[a-z][a-z0-9-]*$/);
export const RepairMechanismSchema = z.enum(["STUDENT_SELECTED_UNSEEN_EVIDENCE", "SHORT_DECISION_JUSTIFICATION", "ANNOTATED_REASONING_ARTIFACT", "ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE", "CONSTRAINED_IN_CLASS_RESPONSE", "TRACKED_REVISION_WITH_RATIONALE", "LIVE_ORAL_DEFENSE"]);

export const StructuredRepairSchema = z.object({
  lostEvidenceIds: z.array(IdSchema).min(1),
  targetedEvidenceIds: z.array(IdSchema).min(1),
  repairMechanism: RepairMechanismSchema,
  repairText: z.string().trim().min(1).max(1800),
  whyThisRepairFits: z.string().trim().min(1).max(1000),
  minimalityReason: z.string().trim().min(1).max(800),
  addedStudentBurden: z.string().trim().min(1).max(400),
  humanOnlyRequirement: z.boolean(),
  attackMechanismAddressed: z.string().trim().min(1).max(800),
}).strict();

const titleFor = (mechanism: RepairMechanism) => ({
  STUDENT_SELECTED_UNSEEN_EVIDENCE: "Add one unseen evidence selection",
  SHORT_DECISION_JUSTIFICATION: "Add one short decision justification",
  ANNOTATED_REASONING_ARTIFACT: "Add a compact annotated reasoning trace",
  ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE: "Add one alternative interpretation",
  CONSTRAINED_IN_CLASS_RESPONSE: "Add one constrained in-class evidence sample",
  TRACKED_REVISION_WITH_RATIONALE: "Add one tracked revision with rationale",
  LIVE_ORAL_DEFENSE: "Add one brief live oral check",
})[mechanism];

export function validateRepair(value: unknown, input: AssessmentInput, model: ConstructModel, attack: AttackResult): Repair {
  const parsed = StructuredRepairSchema.parse(value);
  const known = new Set(model.requiredEvidence.map((item) => item.id));
  const bypassed = new Set(attack.bypassedEvidenceIds);
  if (new Set(parsed.lostEvidenceIds).size !== parsed.lostEvidenceIds.length || new Set(parsed.targetedEvidenceIds).size !== parsed.targetedEvidenceIds.length) throw new Error("Repair evidence IDs must not contain duplicates.");
  if (parsed.lostEvidenceIds.length !== bypassed.size || parsed.lostEvidenceIds.some((id) => !bypassed.has(id))) throw new Error("Repair lostEvidenceIds must exactly match the successful bypass.");
  for (const id of parsed.targetedEvidenceIds) {
    if (!known.has(id)) throw new Error(`Repair references invented evidence ${id}.`);
    if (!bypassed.has(id)) throw new Error(`Repair targets evidence ${id} that was not bypassed.`);
  }
  if (/replace|rewrite|change/i.test(parsed.repairText) && /learning outcome/i.test(parsed.repairText)) throw new Error("Repair may not replace the Learning Outcome.");
  if (parsed.repairText.includes(input.assignmentPrompt) || /rewrite (the )?(entire|whole|full) assignment/i.test(parsed.repairText)) throw new Error("Generic full-assignment rewrites are not a bounded repair.");
  if (!/bounded|one |single|only|leaves the original|unchanged|no more than|minute|sentence|word/i.test(`${parsed.repairText} ${parsed.minimalityReason}`)) throw new Error("Repair must preserve the original assignment plus one bounded evidence requirement.");
  const humanOnlyMechanism = parsed.repairMechanism === "CONSTRAINED_IN_CLASS_RESPONSE" || parsed.repairMechanism === "LIVE_ORAL_DEFENSE";
  if (parsed.humanOnlyRequirement && !humanOnlyMechanism) throw new Error("Only constrained in-class response or live oral defense may be human-only.");
  if (parsed.humanOnlyRequirement && parsed.repairMechanism === "CONSTRAINED_IN_CLASS_RESPONSE" && !/in-class|supervised|newly supplied|unseen.*during/i.test(parsed.repairText)) throw new Error("A human-only constrained response must require a supervised or newly supplied in-class performance.");
  if (parsed.humanOnlyRequirement && parsed.repairMechanism === "LIVE_ORAL_DEFENSE" && !/live|oral|spoken/i.test(parsed.repairText)) throw new Error("A human-only oral defense must require live spoken performance.");
  if (parsed.repairMechanism === "LIVE_ORAL_DEFENSE") {
    const lostItems = model.requiredEvidence.filter((item) => bypassed.has(item.id));
    const allOral = lostItems.every((item) => /oral|spoken|speaking|pronunciation|presentation|respond live/.test(`${item.id} ${item.label} ${item.description}`.toLowerCase()));
    if (!allOral && !/no lower[- ]burden|lower[- ]burden.*not|only defensible/i.test(parsed.whyThisRepairFits)) throw new Error("Live oral defense requires spoken-performance evidence or an explicit no-lower-burden justification.");
  }
  const requirementId = parsed.repairMechanism.toLowerCase().replaceAll("_", "-");
  return {
    title: titleFor(parsed.repairMechanism), change: parsed.repairText, repairedAssignment: `${input.assignmentPrompt}\n\n${parsed.repairText}`,
    protectedEvidenceIds: parsed.targetedEvidenceIds, requirements: [{ id: requirementId, requirement: parsed.repairText, evidenceIds: parsed.targetedEvidenceIds, humanOnly: parsed.humanOnlyRequirement }],
    rationale: parsed.whyThisRepairFits, ...parsed,
  };
}

export function rejectRepairDomainEscalation(value: unknown) {
  if (!value || typeof value !== "object") return;
  const forbidden = ["bypassScore", "bypassDetected", "qualityScore", "thresholds", "states", "workflowState", "repairSucceeded"];
  for (const field of forbidden) if (field in value) throw new Error(`Repair Agent output may not provide ${field}.`);
}
