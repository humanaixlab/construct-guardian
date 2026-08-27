import { generateAssessmentAttacks, type AssessmentAttacker } from "./attacker/attacker.ts";
import type { ConstructAnalysis } from "./construct/analyst.ts";
import { assertWeights, evaluateAttack, reattack, THRESHOLDS, transition, type AssessmentInput, type GuardianRun, type StageProvenance, type WorkflowState } from "./guardian.ts";
import { evaluateSubmissionQuality, type QualityEvaluator } from "./quality/evaluator.ts";
import { generateRepair, type RepairAgent } from "./repair/agent.ts";

export type GuardianProviders = { attacker: AssessmentAttacker; quality: QualityEvaluator; repair: RepairAgent };

function aggregateProvenance(items: StageProvenance[]): StageProvenance {
  const fallbacks = items.filter((item) => item.provider === "DETERMINISTIC_FALLBACK");
  return fallbacks.length ? { provider: "DETERMINISTIC_FALLBACK", fallbackReason: [...new Set(fallbacks.map((item) => item.fallbackReason).filter(Boolean))].join(" | ") } : { provider: "STRANDS_BEDROCK" };
}

export async function runGuardianWithProviders(input: AssessmentInput, analysis: ConstructAnalysis, providers: GuardianProviders): Promise<GuardianRun> {
  const states: WorkflowState[] = ["INGESTED"];
  const construct = analysis.model;
  assertWeights(construct);
  states.push(transition(states.at(-1)!, "CONSTRUCT_MODELED"));

  const generated = await generateAssessmentAttacks(input, construct, providers.attacker);
  const evaluated = await Promise.all(generated.strategies.map(async (strategy) => {
    const quality = await evaluateSubmissionQuality(input, construct, strategy, providers.quality);
    return { quality, attack: evaluateAttack(construct, { ...strategy, qualityScore: quality.result.overallQuality }) };
  }));
  const attacks = evaluated.map((item) => item.attack);
  const qualityEvaluations = evaluated.map((item) => item.quality.result);
  const qualityProvenance = aggregateProvenance(evaluated.map((item) => item.quality.provenance));
  states.push(transition(states.at(-1)!, "ATTACK_EXECUTED"));

  const successfulAttack = [...attacks].filter((attack) => attack.bypassDetected).sort((a, b) => b.bypassScore - a.bypassScore)[0] ?? null;
  states.push(transition(states.at(-1)!, successfulAttack ? "BYPASS_CONFIRMED" : "NO_BYPASS"));
  if (!successfulAttack) return { input, construct, analyst: { provider: analysis.provider, fallbackReason: analysis.fallbackReason }, attacker: generated.provenance, quality: qualityProvenance, repairAgent: null, qualityEvaluations, attacks, successfulAttack, repair: null, reattack: null, states, thresholds: THRESHOLDS };

  const successfulQuality = qualityEvaluations.find((item) => item.strategyId === successfulAttack.id)!;
  const proposed = await generateRepair(input, construct, successfulAttack, successfulQuality, providers.repair);
  states.push(transition(states.at(-1)!, "REPAIR_PROPOSED"));
  const repeatedAttack = reattack(construct, successfulAttack, proposed.repair);
  states.push(transition(states.at(-1)!, "REATTACKED"));
  states.push(transition(states.at(-1)!, repeatedAttack.bypassDetected ? "STILL_VULNERABLE" : "BYPASS_CLOSED"));
  return { input, construct, analyst: { provider: analysis.provider, fallbackReason: analysis.fallbackReason }, attacker: generated.provenance, quality: qualityProvenance, repairAgent: proposed.provenance, qualityEvaluations, attacks, successfulAttack, repair: proposed.repair, reattack: repeatedAttack, states, thresholds: THRESHOLDS };
}
