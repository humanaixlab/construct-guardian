export type WorkflowState = "INGESTED" | "CONSTRUCT_MODELED" | "ATTACK_EXECUTED" | "BYPASS_CONFIRMED" | "NO_BYPASS" | "REPAIR_PROPOSED" | "REATTACKED" | "BYPASS_CLOSED" | "STILL_VULNERABLE";
export type AssessmentInput = { learningOutcome: string; assignmentPrompt: string; rubric: string };
export type EvidenceItem = { id: string; label: string; description: string; weight: number };
export type TaskStep = { id: string; action: string; demonstratesEvidenceIds: string[] };
export type ConstructModel = { constructName: string; constructDescription: string; requiredEvidence: EvidenceItem[]; taskSteps: TaskStep[] };
export type AttackStrategy = { id: string; name: string; aiRole: string; retainedEvidenceIds: string[]; qualityScore: number; simulatedSubmission: string };
export type RequirementAttemptStatus = "COMPLETED_BY_ATTACK" | "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT";
export type RequirementAttempt = { requirementId: string; requirement: string; evidenceIds: string[]; status: RequirementAttemptStatus; explanation: string };
export type RepairRequirement = { id: string; requirement: string; evidenceIds: string[]; humanOnly: boolean };
export type AttackResult = AttackStrategy & { bypassedEvidenceIds: string[]; humanEvidenceRetained: number; bypassScore: number; bypassDetected: boolean; requirementAttempts: RequirementAttempt[]; blockedByHumanOnlyRequirement: boolean };
export type RepairMechanism = "STUDENT_SELECTED_UNSEEN_EVIDENCE" | "SHORT_DECISION_JUSTIFICATION" | "ANNOTATED_REASONING_ARTIFACT" | "ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE" | "CONSTRAINED_IN_CLASS_RESPONSE" | "TRACKED_REVISION_WITH_RATIONALE" | "LIVE_ORAL_DEFENSE";
export type Repair = { title: string; change: string; repairedAssignment: string; protectedEvidenceIds: string[]; requirements: RepairRequirement[]; rationale: string; lostEvidenceIds: string[]; repairMechanism: RepairMechanism; repairText: string; whyThisRepairFits: string; minimalityReason: string; addedStudentBurden: string; humanOnlyRequirement: boolean };
export type AnalystProvenance = { provider: "STRANDS_BEDROCK" | "DETERMINISTIC_FALLBACK"; fallbackReason?: string };
export type GuardianRun = { input: AssessmentInput; construct: ConstructModel; analyst: AnalystProvenance; attacks: AttackResult[]; successfulAttack: AttackResult | null; repair: Repair | null; reattack: AttackResult | null; states: WorkflowState[]; thresholds: typeof THRESHOLDS };

export const THRESHOLDS = { highQuality: 0.75, substantialBypass: 0.5 } as const;
export const GOLDEN_DEMO: AssessmentInput = {
  learningOutcome: "Students can independently identify and justify persuasive strategies using textual evidence.",
  assignmentPrompt: "Analyze a persuasive campaign. Identify the main persuasive strategies used and explain how they influence the audience.",
  rubric: ["accurate identification of persuasive strategies", "appropriate textual evidence", "justification of the relationship between evidence and strategy", "consideration of an alternative interpretation"].join("\n"),
};
const round = (value: number) => Math.round(value * 1000) / 1000;
export function validateInput(input: AssessmentInput) {
  const missing = Object.entries(input).filter(([, value]) => !value.trim()).map(([key]) => key);
  if (missing.length) throw new Error(`Missing required input: ${missing.join(", ")}`);
}
export function assertWeights(model: ConstructModel) {
  const total = round(model.requiredEvidence.reduce((sum, item) => sum + item.weight, 0));
  if (total !== 1) throw new Error(`Evidence weights must total 1. Received ${total}.`);
  return total;
}
export function calculateEvidenceScore(evidence: EvidenceItem[], retainedEvidenceIds: string[]) {
  const retained = new Set(retainedEvidenceIds);
  const humanEvidenceRetained = round(evidence.filter((item) => retained.has(item.id)).reduce((sum, item) => sum + item.weight, 0));
  return { humanEvidenceRetained, bypassScore: round(1 - humanEvidenceRetained), contributions: evidence.map((item) => ({ evidenceId: item.id, label: item.label, weight: item.weight, retained: retained.has(item.id) })) };
}
export function isBypass(qualityScore: number, bypassScore: number) { return qualityScore >= THRESHOLDS.highQuality && bypassScore >= THRESHOLDS.substantialBypass; }
export function transition(current: WorkflowState, next: WorkflowState) {
  const allowed: Record<WorkflowState, WorkflowState[]> = { INGESTED: ["CONSTRUCT_MODELED"], CONSTRUCT_MODELED: ["ATTACK_EXECUTED"], ATTACK_EXECUTED: ["BYPASS_CONFIRMED", "NO_BYPASS"], BYPASS_CONFIRMED: ["REPAIR_PROPOSED"], NO_BYPASS: [], REPAIR_PROPOSED: ["REATTACKED"], REATTACKED: ["BYPASS_CLOSED", "STILL_VULNERABLE"], BYPASS_CLOSED: [], STILL_VULNERABLE: [] };
  if (!allowed[current].includes(next)) throw new Error(`Invalid transition: ${current} → ${next}`);
  return next;
}
export function buildConstructModel(input: AssessmentInput): ConstructModel {
  validateInput(input);
  const construct: ConstructModel = {
    constructName: "Independent evidence-based persuasive analysis", constructDescription: input.learningOutcome,
    requiredEvidence: [
      { id: "identify", label: "Strategy identification", description: "Student independently identifies persuasive strategies.", weight: 0.25 },
      { id: "select", label: "Evidence selection", description: "Student selects appropriate textual evidence.", weight: 0.2 },
      { id: "justify", label: "Evidence–strategy justification", description: "Student explains why the evidence supports the identified strategy.", weight: 0.35 },
      { id: "alternative", label: "Alternative interpretation", description: "Student considers and evaluates a plausible alternative reading.", weight: 0.2 },
    ],
    taskSteps: [
      { id: "step-1", action: "Inspect the campaign and identify persuasive strategies.", demonstratesEvidenceIds: ["identify"] },
      { id: "step-2", action: "Choose textual evidence for each strategy.", demonstratesEvidenceIds: ["select"] },
      { id: "step-3", action: "Explain the evidence–strategy relationship and audience effect.", demonstratesEvidenceIds: ["justify"] },
      { id: "step-4", action: "Consider an alternative interpretation.", demonstratesEvidenceIds: ["alternative"] },
    ],
  };
  assertWeights(construct); return construct;
}
function strategyCatalog(): AttackStrategy[] { return [
  { id: "prep-only", name: "Preparation assistant", aiRole: "AI suggests a checklist and terminology; the student performs the analysis.", retainedEvidenceIds: ["identify", "select", "justify", "alternative"], qualityScore: 0.82, simulatedSubmission: "The student uses an AI-generated planning checklist, then independently identifies ethos and emotional appeal, selects campaign language, justifies each link, and weighs an alternative reading." },
  { id: "reasoning-partner", name: "Reasoning substitution", aiRole: "AI identifies strategies and drafts the evidence-to-strategy reasoning; the student edits and adds an alternative.", retainedEvidenceIds: ["select", "alternative"], qualityScore: 0.88, simulatedSubmission: "The campaign builds credibility through expert testimony and urgency through loss framing. The quoted claims align authority with the proposed action. An alternative reading is that the urgency reflects genuine time constraints." },
  { id: "full-generation", name: "Near-total AI completion", aiRole: "AI analyzes the campaign, selects evidence, writes the justification, and produces the final submission.", retainedEvidenceIds: [], qualityScore: 0.94, simulatedSubmission: "The campaign combines ethos, social proof, and urgency. Expert testimony lends credibility, statistics normalize agreement, and deadline language converts delay into perceived loss. Although it could be informational, placement beside the call to action makes persuasion the stronger interpretation." },
]; }
export function evaluateAttack(model: ConstructModel, strategy: AttackStrategy): AttackResult {
  const score = calculateEvidenceScore(model.requiredEvidence, strategy.retainedEvidenceIds);
  const bypassedEvidenceIds = model.requiredEvidence.filter((item) => !strategy.retainedEvidenceIds.includes(item.id)).map((item) => item.id);
  const requirementAttempts: RequirementAttempt[] = model.taskSteps.map((step) => ({ requirementId: step.id, requirement: step.action, evidenceIds: step.demonstratesEvidenceIds, status: "COMPLETED_BY_ATTACK", explanation: "The AI-assisted strategy can produce an artifact satisfying this written task step." }));
  return { ...strategy, ...score, bypassedEvidenceIds, requirementAttempts, blockedByHumanOnlyRequirement: false, bypassDetected: isBypass(strategy.qualityScore, score.bypassScore) };
}
export function executeAttacks(model: ConstructModel) { return strategyCatalog().map((strategy) => evaluateAttack(model, strategy)); }
export function proposeRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult): Repair {
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
  let title: string;
  let repairText: string;
  let whyThisRepairFits: string;
  let addedStudentBurden: string;
  let humanOnlyRequirement = false;

  if (allLostEvidenceIsOral) {
    repairMechanism = "LIVE_ORAL_DEFENSE";
    title = "Add one brief live oral check";
    repairText = "Complete a live 3-minute oral check addressing only the identified spoken-performance evidence.";
    whyThisRepairFits = "The lost evidence is itself live spoken performance, so a brief oral check directly samples the same construct.";
    addedStudentBurden = "One 3-minute oral check.";
    humanOnlyRequirement = true;
  } else if (lost.size === model.requiredEvidence.length) {
    repairMechanism = "CONSTRAINED_IN_CLASS_RESPONSE";
    title = "Add one constrained in-class evidence sample";
    repairText = "After submission, complete one 8-minute in-class response to a newly supplied campaign excerpt: identify one strategy, select one quotation, justify the connection, and note one plausible alternative reading.";
    whyThisRepairFits = "All required evidence was bypassed, so one compact unseen response restores an attributable sample across the complete evidence chain.";
    addedStudentBurden = "One 8-minute in-class response.";
    humanOnlyRequirement = true;
  } else if (matches(/select|selection|choose|quotation|textual evidence/) && lost.size === 1) {
    repairMechanism = "STUDENT_SELECTED_UNSEEN_EVIDENCE";
    title = "Add one unseen evidence selection";
    repairText = "Select one relevant quotation from a short excerpt released with the task and add one sentence explaining its relevance.";
    whyThisRepairFits = "The missing evidence is independent evidence selection, which is observed directly through one new selection rather than a broader defense.";
    addedStudentBurden = "One quotation and one sentence.";
  } else if (matches(/justify|justification|explain why|reasoning|inference/) && lost.size === 1) {
    repairMechanism = "SHORT_DECISION_JUSTIFICATION";
    title = "Add one short decision justification";
    repairText = "Add 2–3 sentences explaining why one selected quotation supports the named persuasive strategy rather than the closest competing label.";
    whyThisRepairFits = "The bypass removed the evidence-to-strategy inference, so a focused justification restores that exact reasoning evidence.";
    addedStudentBurden = "Two to three sentences.";
  } else if (matches(/alternative|counterexample|counter-example|competing interpretation/) && lost.size === 1) {
    repairMechanism = "ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE";
    title = "Add one alternative interpretation";
    repairText = "State one plausible alternative interpretation of a chosen passage and give one sentence explaining why the preferred interpretation remains stronger.";
    whyThisRepairFits = "The missing evidence is consideration of an alternative reading, so one bounded alternative directly restores it.";
    addedStudentBurden = "One alternative and one comparison sentence.";
  } else if (matches(/identify|identification|justify|justification|reasoning|inference/)) {
    repairMechanism = "ANNOTATED_REASONING_ARTIFACT";
    title = "Add a compact annotated reasoning trace";
    repairText = "Attach one annotation linking a chosen passage to the strategy label and the inference used to reach that label; limit the annotation to 75 words.";
    whyThisRepairFits = "The lost evidence spans an analytical decision and its reasoning, which one bounded annotation exposes without replacing the assignment.";
    addedStudentBurden = "One annotation of no more than 75 words.";
  } else {
    repairMechanism = "TRACKED_REVISION_WITH_RATIONALE";
    title = "Add one tracked revision with rationale";
    repairText = "Revise one marked passage and append a 50-word rationale identifying what changed and which evidence informed the revision.";
    whyThisRepairFits = "The remaining lost-evidence combination is best recovered through a small visible revision tied to the affected evidence.";
    addedStudentBurden = "One revision and a rationale of no more than 50 words.";
  }

  const minimalityReason = "This appends one bounded evidence requirement and leaves the original prompt, rubric, and all other task components unchanged.";
  const requirementId = repairMechanism.toLowerCase().replaceAll("_", "-");
  return { title, change: repairText, repairedAssignment: `${input.assignmentPrompt}\n\n${repairText}`, protectedEvidenceIds: lostEvidenceIds, requirements: [{ id: requirementId, requirement: repairText, evidenceIds: lostEvidenceIds, humanOnly: humanOnlyRequirement }], rationale: whyThisRepairFits, lostEvidenceIds, repairMechanism, repairText, whyThisRepairFits, minimalityReason, addedStudentBurden, humanOnlyRequirement };
}
export function reattack(model: ConstructModel, original: AttackResult, repair: Repair): AttackResult {
  const baseline = evaluateAttack(model, { ...original, retainedEvidenceIds: original.retainedEvidenceIds, qualityScore: original.qualityScore, simulatedSubmission: `${original.simulatedSubmission} The same AI-generated submission is presented, then the same attack attempts every repaired requirement.` });
  const repairAttempts: RequirementAttempt[] = repair.requirements.map((requirement) => requirement.humanOnly
    ? { requirementId: requirement.id, requirement: requirement.requirement, evidenceIds: requirement.evidenceIds, status: "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT", explanation: "The strategy can generate the written submission, but it cannot perform a live, unaided human defense." }
    : { requirementId: requirement.id, requirement: requirement.requirement, evidenceIds: requirement.evidenceIds, status: "COMPLETED_BY_ATTACK", explanation: "The strategy can satisfy this added requirement." });
  const requirementAttempts = [...baseline.requirementAttempts, ...repairAttempts];
  const blockedByHumanOnlyRequirement = requirementAttempts.some((attempt) => attempt.status === "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT");
  return { ...baseline, requirementAttempts, blockedByHumanOnlyRequirement, bypassDetected: baseline.bypassDetected && !blockedByHumanOnlyRequirement };
}
export function runGuardian(input: AssessmentInput, suppliedConstruct?: ConstructModel, analyst: AnalystProvenance = { provider: "DETERMINISTIC_FALLBACK", fallbackReason: "Deterministic direct execution." }): GuardianRun {
  const states: WorkflowState[] = ["INGESTED"];
  const construct = suppliedConstruct ?? buildConstructModel(input); assertWeights(construct); states.push(transition(states.at(-1)!, "CONSTRUCT_MODELED"));
  const attacks = executeAttacks(construct); states.push(transition(states.at(-1)!, "ATTACK_EXECUTED"));
  const successfulAttack = [...attacks].filter((attack) => attack.bypassDetected).sort((a, b) => b.bypassScore - a.bypassScore)[0] ?? null;
  states.push(transition(states.at(-1)!, successfulAttack ? "BYPASS_CONFIRMED" : "NO_BYPASS"));
  if (!successfulAttack) return { input, construct, analyst, attacks, successfulAttack, repair: null, reattack: null, states, thresholds: THRESHOLDS };
  const repair = proposeRepair(input, construct, successfulAttack); states.push(transition(states.at(-1)!, "REPAIR_PROPOSED"));
  const repeatedAttack = reattack(construct, successfulAttack, repair); states.push(transition(states.at(-1)!, "REATTACKED"));
  states.push(transition(states.at(-1)!, repeatedAttack.bypassDetected ? "STILL_VULNERABLE" : "BYPASS_CLOSED"));
  return { input, construct, analyst, attacks, successfulAttack, repair, reattack: repeatedAttack, states, thresholds: THRESHOLDS };
}
export const toPercent = (value: number) => `${Math.round(value * 100)}%`;
export function percentageTrace(run: GuardianRun) {
  return run.attacks.flatMap((attack) => [
    { label: `${attack.id}: human evidence retained`, value: attack.humanEvidenceRetained, source: attack.retainedEvidenceIds },
    { label: `${attack.id}: bypass score`, value: attack.bypassScore, source: attack.bypassedEvidenceIds },
  ]).concat(run.reattack ? [
    { label: "reattack: human evidence retained", value: run.reattack.humanEvidenceRetained, source: run.reattack.retainedEvidenceIds },
    { label: "reattack: bypass score", value: run.reattack.bypassScore, source: run.reattack.bypassedEvidenceIds },
  ] : []);
}
