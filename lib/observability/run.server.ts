import { analyzeConstruct, type ConstructAnalyst } from "../construct/analyst.ts";
import type { AssessmentInput, GuardianRun } from "../guardian.ts";
import { runGuardianWithProviders, type GuardianProviders } from "../workflow.server.ts";
import type { RunObservability } from "./types.ts";
import { fallbackReasonCategory, safeStartStage } from "./types.ts";

export async function runObservedGuardian(input: AssessmentInput, analyst: ConstructAnalyst, providers: GuardianProviders, observability: RunObservability, modelId: string): Promise<GuardianRun> {
  return observability.traceRun(async (traceSession) => {
    const constructStage = safeStartStage(traceSession, "construct_analysis", { modelId });
    const analysis = await analyzeConstruct(input, analyst);
    constructStage.finish({ provider: analysis.provider, modelId, success: true, fallbackUsed: analysis.provider === "DETERMINISTIC_FALLBACK", fallbackReasonCategory: fallbackReasonCategory(analysis.fallbackReason) });
    const domainRun = await runGuardianWithProviders(input, analysis, providers, traceSession, modelId);
    return { ...domainRun, observability: { provider: observability.mode } };
  });
}
