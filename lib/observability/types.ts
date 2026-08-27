export const LIFECYCLE_STAGES = [
  "construct_analysis",
  "assessment_attack",
  "quality_evaluation",
  "construct_bypass_evaluation",
  "repair_proposal",
  "exact_strategy_reattack",
  "final_outcome",
] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number];
export type FallbackReasonCategory = "NONE" | "THROTTLING" | "TIMEOUT" | "MISSING_CREDENTIALS" | "VALIDATION" | "RUNTIME";
export type TraceMetadata = {
  provider?: "STRANDS_BEDROCK" | "DETERMINISTIC_FALLBACK";
  modelId?: string;
  success?: boolean;
  fallbackUsed?: boolean;
  fallbackReasonCategory?: FallbackReasonCategory;
  strategyId?: string;
  constructBypass?: boolean;
  repairMechanism?: string;
  reattackOutcome?: "BYPASS_CLOSED" | "STILL_VULNERABLE";
  finalWorkflowStatus?: string;
};

export interface ObservedStage {
  finish(metadata?: TraceMetadata): void;
}

export interface RunTraceSession {
  startStage(stage: LifecycleStage, metadata?: TraceMetadata): ObservedStage;
}

export interface RunObservability {
  readonly mode: "AMAZON_BEDROCK_AGENTCORE" | "LOCAL_NOOP";
  traceRun<T>(operation: (session: RunTraceSession) => Promise<T>): Promise<T>;
}

const NOOP_STAGE: ObservedStage = { finish() {} };
export const NOOP_TRACE_SESSION: RunTraceSession = { startStage: () => NOOP_STAGE };
export const NOOP_OBSERVABILITY: RunObservability = { mode: "LOCAL_NOOP", traceRun: (operation) => operation(NOOP_TRACE_SESSION) };

export function safeStartStage(session: RunTraceSession, stage: LifecycleStage, metadata?: TraceMetadata): ObservedStage {
  try { return session.startStage(stage, metadata); }
  catch { return NOOP_STAGE; }
}

export function fallbackReasonCategory(reason?: string): FallbackReasonCategory {
  if (!reason) return "NONE";
  if (/throttl|too many tokens|quota|rate.?limit/i.test(reason)) return "THROTTLING";
  if (/timeout|timed out|abort/i.test(reason)) return "TIMEOUT";
  if (/credential|access key|unauthorized|authentication|token.*missing/i.test(reason)) return "MISSING_CREDENTIALS";
  if (/valid|malformed|schema|duplicate|missing criterion|nonexistent|invented|mapping/i.test(reason)) return "VALIDATION";
  return "RUNTIME";
}
