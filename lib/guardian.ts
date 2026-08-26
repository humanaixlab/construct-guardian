export type WorkflowState = "INGESTED" | "CONSTRUCT_MODELED" | "ATTACK_EXECUTED" | "BYPASS_CONFIRMED" | "NO_BYPASS" | "REPAIR_PROPOSED" | "REATTACKED" | "BYPASS_CLOSED" | "STILL_VULNERABLE";
export type AssessmentInput = { learningOutcome: string; assignmentPrompt: string; rubric: string };
export type EvidenceItem = { id: string; label: string; description: string; weight: number };
export type TaskStep = { id: string; action: string; demonstratesEvidenceIds: string[] };
export type ConstructModel = { constructName: string; constructDescription: string; requiredEvidence: EvidenceItem[]; taskSteps: TaskStep[] };
export type AttackStrategy = { id: string; name: string; aiRole: string; retainedEvidenceIds: string[]; qualityScore: number; simulatedSubmission: string };
export type AttackResult = AttackStrategy & { bypassedEvidenceIds: string[]; humanEvidenceRetained: number; bypassScore: number; bypassDetected: boolean };
export type Repair = { title: string; change: string; repairedAssignment: string; protectedEvidenceIds: string[]; rationale: string };
export type GuardianRun = { input: AssessmentInput; construct: ConstructModel; attacks: AttackResult[]; successfulAttack: AttackResult | null; repair: Repair | null; reattack: AttackResult | null; states: WorkflowState[]; thresholds: typeof THRESHOLDS };

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
  return { ...strategy, ...score, bypassedEvidenceIds, bypassDetected: isBypass(strategy.qualityScore, score.bypassScore) };
}
export function executeAttacks(model: ConstructModel) { return strategyCatalog().map((strategy) => evaluateAttack(model, strategy)); }
export function proposeRepair(input: AssessmentInput, model: ConstructModel, attack: AttackResult): Repair {
  if (!attack.bypassDetected) throw new Error("Repair requires a confirmed construct bypass.");
  const change = "Add a 4-minute oral evidence check: the student must defend one selected quotation, explain why it supports the named strategy, and respond to one alternative interpretation without notes.";
  return { title: "Add a brief oral evidence check", change, repairedAssignment: `${input.assignmentPrompt}\n\n${change}`, protectedEvidenceIds: attack.bypassedEvidenceIds, rationale: `This preserves the assignment and adds direct performance evidence for ${attack.bypassedEvidenceIds.length} vulnerable construct components.` };
}
export function reattack(model: ConstructModel, original: AttackResult, repair: Repair): AttackResult {
  const retainedEvidenceIds = Array.from(new Set([...original.retainedEvidenceIds, ...repair.protectedEvidenceIds]));
  return evaluateAttack(model, { ...original, retainedEvidenceIds, qualityScore: original.qualityScore, simulatedSubmission: `${original.simulatedSubmission} The same AI-generated submission is presented, but the student must now personally defend the evidence and reasoning during the oral check.` });
}
export function runGuardian(input: AssessmentInput): GuardianRun {
  const states: WorkflowState[] = ["INGESTED"];
  const construct = buildConstructModel(input); states.push(transition(states.at(-1)!, "CONSTRUCT_MODELED"));
  const attacks = executeAttacks(construct); states.push(transition(states.at(-1)!, "ATTACK_EXECUTED"));
  const successfulAttack = [...attacks].filter((attack) => attack.bypassDetected).sort((a, b) => b.bypassScore - a.bypassScore)[0] ?? null;
  states.push(transition(states.at(-1)!, successfulAttack ? "BYPASS_CONFIRMED" : "NO_BYPASS"));
  if (!successfulAttack) return { input, construct, attacks, successfulAttack, repair: null, reattack: null, states, thresholds: THRESHOLDS };
  const repair = proposeRepair(input, construct, successfulAttack); states.push(transition(states.at(-1)!, "REPAIR_PROPOSED"));
  const repeatedAttack = reattack(construct, successfulAttack, repair); states.push(transition(states.at(-1)!, "REATTACKED"));
  states.push(transition(states.at(-1)!, repeatedAttack.bypassDetected ? "STILL_VULNERABLE" : "BYPASS_CLOSED"));
  return { input, construct, attacks, successfulAttack, repair, reattack: repeatedAttack, states, thresholds: THRESHOLDS };
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
