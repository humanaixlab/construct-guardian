import { proposeDeterministicRepair } from "./repair/agent.ts";
import type { QualityResult } from "./quality/schema.ts";

export type WorkflowState = "INGESTED" | "CONSTRUCT_MODELED" | "ATTACK_EXECUTED" | "BYPASS_CONFIRMED" | "NO_BYPASS" | "REPAIR_PROPOSED" | "REATTACKED" | "BYPASS_CLOSED" | "STILL_VULNERABLE";
export type AssessmentInput = { learningOutcome: string; assignmentPrompt: string; rubric: string };
export type EvidenceItem = { id: string; label: string; description: string; weight: number };
export type TaskStep = { id: string; action: string; demonstratesEvidenceIds: string[] };
export type ConstructModel = { constructName: string; constructDescription: string; requiredEvidence: EvidenceItem[]; taskSteps: TaskStep[] };
export type AttackStrategy = { id: string; name: string; aiRole: string; retainedEvidenceIds: string[]; qualityScore: number; simulatedSubmission: string; strategyClass?: "PREPARATION_ASSISTANCE" | "PARTIAL_DELEGATION" | "NEAR_TOTAL_COMPLETION"; description?: string; delegatedEvidenceIds?: string[]; studentActions?: string[]; aiActions?: string[]; expectedAttackMechanism?: string };
export type RequirementAttemptStatus = "COMPLETED_BY_ATTACK" | "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT";
export type RequirementAttempt = { requirementId: string; requirement: string; evidenceIds: string[]; status: RequirementAttemptStatus; explanation: string };
export type RepairRequirement = { id: string; requirement: string; evidenceIds: string[]; humanOnly: boolean };
export type AttackResult = AttackStrategy & { bypassedEvidenceIds: string[]; humanEvidenceRetained: number; bypassScore: number; bypassDetected: boolean; requirementAttempts: RequirementAttempt[]; blockedByHumanOnlyRequirement: boolean };
export type RepairMechanism = "STUDENT_SELECTED_UNSEEN_EVIDENCE" | "SHORT_DECISION_JUSTIFICATION" | "ANNOTATED_REASONING_ARTIFACT" | "ALTERNATIVE_INTERPRETATION_OR_COUNTEREXAMPLE" | "CONSTRAINED_IN_CLASS_RESPONSE" | "TRACKED_REVISION_WITH_RATIONALE" | "LIVE_ORAL_DEFENSE";
export type Repair = { title: string; change: string; repairedAssignment: string; protectedEvidenceIds: string[]; requirements: RepairRequirement[]; rationale: string; lostEvidenceIds: string[]; targetedEvidenceIds: string[]; repairMechanism: RepairMechanism; repairText: string; whyThisRepairFits: string; minimalityReason: string; addedStudentBurden: string; humanOnlyRequirement: boolean; attackMechanismAddressed: string };
export type StageProvenance = { provider: "STRANDS_BEDROCK" | "DETERMINISTIC_FALLBACK"; fallbackReason?: string };
export type AnalystProvenance = StageProvenance;
export type GuardianRun = { input: AssessmentInput; construct: ConstructModel; analyst: AnalystProvenance; attacker: StageProvenance; quality: StageProvenance; repairAgent: StageProvenance | null; qualityEvaluations: QualityResult[]; attacks: AttackResult[]; successfulAttack: AttackResult | null; repair: Repair | null; reattack: AttackResult | null; states: WorkflowState[]; thresholds: typeof THRESHOLDS };

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
  return proposeDeterministicRepair(input, model, attack);
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
  const deterministic = { provider: "DETERMINISTIC_FALLBACK", fallbackReason: "Deterministic direct execution." } as const;
  if (!successfulAttack) return { input, construct, analyst, attacker: deterministic, quality: deterministic, repairAgent: null, qualityEvaluations: [], attacks, successfulAttack, repair: null, reattack: null, states, thresholds: THRESHOLDS };
  const repair = proposeRepair(input, construct, successfulAttack); states.push(transition(states.at(-1)!, "REPAIR_PROPOSED"));
  const repeatedAttack = reattack(construct, successfulAttack, repair); states.push(transition(states.at(-1)!, "REATTACKED"));
  states.push(transition(states.at(-1)!, repeatedAttack.bypassDetected ? "STILL_VULNERABLE" : "BYPASS_CLOSED"));
  return { input, construct, analyst, attacker: deterministic, quality: deterministic, repairAgent: deterministic, qualityEvaluations: [], attacks, successfulAttack, repair, reattack: repeatedAttack, states, thresholds: THRESHOLDS };
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
