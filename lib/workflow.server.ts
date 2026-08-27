import { generateAssessmentAttacks, type AssessmentAttacker } from "./attacker/attacker.ts";
import type { ConstructAnalysis } from "./construct/analyst.ts";
import { assertWeights, evaluateAttack, reattack, THRESHOLDS, transition, type AssessmentInput, type GuardianRun, type StageProvenance, type WorkflowState } from "./guardian.ts";
import { evaluateSubmissionQuality, type QualityEvaluator } from "./quality/evaluator.ts";
import { generateRepair, type RepairAgent } from "./repair/agent.ts";
import { fallbackReasonCategory, NOOP_TRACE_SESSION, safeStartStage, type RunTraceSession } from "./observability/types.ts";

export type GuardianProviders = { attacker: AssessmentAttacker; quality: QualityEvaluator; repair: RepairAgent };

function aggregateProvenance(items: StageProvenance[]): StageProvenance {
  const fallbacks = items.filter((item) => item.provider === "DETERMINISTIC_FALLBACK");
  return fallbacks.length ? { provider: "DETERMINISTIC_FALLBACK", fallbackReason: [...new Set(fallbacks.map((item) => item.fallbackReason).filter(Boolean))].join(" | ") } : { provider: "STRANDS_BEDROCK" };
}

const provenanceMetadata = (provenance: StageProvenance, modelId?: string) => ({ provider: provenance.provider, modelId, fallbackUsed: provenance.provider === "DETERMINISTIC_FALLBACK", fallbackReasonCategory: fallbackReasonCategory(provenance.fallbackReason), success: true } as const);

export async function runGuardianWithProviders(input: AssessmentInput, analysis: ConstructAnalysis, providers: GuardianProviders, traceSession: RunTraceSession = NOOP_TRACE_SESSION, modelId?: string): Promise<GuardianRun> {
  const states: WorkflowState[] = ["INGESTED"];
  const construct = analysis.model;
  assertWeights(construct);
  states.push(transition(states.at(-1)!, "CONSTRUCT_MODELED"));

  const attackStage = safeStartStage(traceSession, "assessment_attack", { modelId });
  const generated = await generateAssessmentAttacks(input, construct, providers.attacker);
  attackStage.finish(provenanceMetadata(generated.provenance, modelId));

  const qualityStage = safeStartStage(traceSession, "quality_evaluation", { modelId });
  const evaluated = await Promise.all(generated.strategies.map(async (strategy) => {
    const quality = await evaluateSubmissionQuality(input, construct, strategy, providers.quality);
    return { quality, attack: evaluateAttack(construct, { ...strategy, qualityScore: quality.result.overallQuality }) };
  }));
  const attacks = evaluated.map((item) => item.attack);
  const qualityEvaluations = evaluated.map((item) => item.quality.result);
  const qualityProvenance = aggregateProvenance(evaluated.map((item) => item.quality.provenance));
  qualityStage.finish(provenanceMetadata(qualityProvenance, modelId));
  states.push(transition(states.at(-1)!, "ATTACK_EXECUTED"));

  const bypassStage = safeStartStage(traceSession, "construct_bypass_evaluation");
  const successfulAttack = [...attacks].filter((attack) => attack.bypassDetected).sort((a, b) => b.bypassScore - a.bypassScore)[0] ?? null;
  states.push(transition(states.at(-1)!, successfulAttack ? "BYPASS_CONFIRMED" : "NO_BYPASS"));
  bypassStage.finish({ success: true, constructBypass: Boolean(successfulAttack), strategyId: successfulAttack?.id });
  if (!successfulAttack) {
    const finalStage = safeStartStage(traceSession, "final_outcome");
    finalStage.finish({ success: true, constructBypass: false, finalWorkflowStatus: states.at(-1)! });
    return { input, construct, analyst: { provider: analysis.provider, fallbackReason: analysis.fallbackReason }, attacker: generated.provenance, quality: qualityProvenance, repairAgent: null, qualityEvaluations, attacks, successfulAttack, repair: null, reattack: null, states, thresholds: THRESHOLDS };
  }

  const successfulQuality = qualityEvaluations.find((item) => item.strategyId === successfulAttack.id)!;
  const repairStage = safeStartStage(traceSession, "repair_proposal", { modelId, strategyId: successfulAttack.id });
  const proposed = await generateRepair(input, construct, successfulAttack, successfulQuality, providers.repair);
  repairStage.finish({ ...provenanceMetadata(proposed.provenance, modelId), strategyId: successfulAttack.id, repairMechanism: proposed.repair.repairMechanism });
  states.push(transition(states.at(-1)!, "REPAIR_PROPOSED"));

  const reattackStage = safeStartStage(traceSession, "exact_strategy_reattack", { strategyId: successfulAttack.id });
  const repeatedAttack = reattack(construct, successfulAttack, proposed.repair);
  states.push(transition(states.at(-1)!, "REATTACKED"));
  states.push(transition(states.at(-1)!, repeatedAttack.bypassDetected ? "STILL_VULNERABLE" : "BYPASS_CLOSED"));
  reattackStage.finish({ success: true, strategyId: repeatedAttack.id, constructBypass: repeatedAttack.bypassDetected, reattackOutcome: states.at(-1) as "BYPASS_CLOSED" | "STILL_VULNERABLE" });
  const finalStage = safeStartStage(traceSession, "final_outcome");
  finalStage.finish({ success: true, strategyId: repeatedAttack.id, constructBypass: repeatedAttack.bypassDetected, repairMechanism: proposed.repair.repairMechanism, reattackOutcome: states.at(-1) as "BYPASS_CLOSED" | "STILL_VULNERABLE", finalWorkflowStatus: states.at(-1)! });
  return { input, construct, analyst: { provider: analysis.provider, fallbackReason: analysis.fallbackReason }, attacker: generated.provenance, quality: qualityProvenance, repairAgent: proposed.provenance, qualityEvaluations, attacks, successfulAttack, repair: proposed.repair, reattack: repeatedAttack, states, thresholds: THRESHOLDS };
}
