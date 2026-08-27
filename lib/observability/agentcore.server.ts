import { SpanStatusCode, trace, type Attributes, type Span, type Tracer } from "@opentelemetry/api";
import { NOOP_OBSERVABILITY, NOOP_TRACE_SESSION, safeStartStage, type ObservedStage, type RunObservability, type RunTraceSession, type TraceMetadata } from "./types.ts";

const INSTRUMENTATION_NAME = "construct-guardian.agentcore-observability";
const ROOT_TRACE_NAME = "construct_guardian.run";

export interface TelemetrySpan {
  setAttributes(attributes: Record<string, string | number | boolean>): void;
  setSuccess(success: boolean): void;
  end(): void;
}

export interface TelemetryDriver {
  withRoot<T>(name: string, attributes: Record<string, string | number | boolean>, operation: (span: TelemetrySpan) => Promise<T>): Promise<T>;
  startSpan(name: string, attributes: Record<string, string | number | boolean>): TelemetrySpan;
}

class OpenTelemetrySpan implements TelemetrySpan {
  private readonly span: Span;
  constructor(span: Span) { this.span = span; }
  setAttributes(attributes: Record<string, string | number | boolean>) { this.span.setAttributes(attributes as Attributes); }
  setSuccess(success: boolean) { this.span.setStatus({ code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR }); }
  end() { this.span.end(); }
}

class OpenTelemetryDriver implements TelemetryDriver {
  private readonly tracer: Tracer;
  constructor(tracer: Tracer) { this.tracer = tracer; }
  withRoot<T>(name: string, attributes: Record<string, string | number | boolean>, operation: (span: TelemetrySpan) => Promise<T>) {
    return this.tracer.startActiveSpan(name, { attributes: attributes as Attributes }, async (span) => {
      const wrapped = new OpenTelemetrySpan(span);
      try { return await operation(wrapped); }
      finally { try { wrapped.end(); } catch {} }
    });
  }
  startSpan(name: string, attributes: Record<string, string | number | boolean>) { return new OpenTelemetrySpan(this.tracer.startSpan(name, { attributes: attributes as Attributes })); }
}

function safeAttributes(stage: string, metadata: TraceMetadata = {}, durationMs?: number): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = { "guardian.stage": stage };
  if (metadata.provider) attributes["guardian.provider"] = metadata.provider;
  if (metadata.modelId) attributes["gen_ai.request.model"] = metadata.modelId.slice(0, 256);
  if (metadata.success !== undefined) attributes["guardian.success"] = metadata.success;
  if (metadata.fallbackUsed !== undefined) attributes["guardian.fallback_used"] = metadata.fallbackUsed;
  if (metadata.fallbackReasonCategory) attributes["guardian.fallback_reason_category"] = metadata.fallbackReasonCategory;
  if (metadata.strategyId) attributes["guardian.strategy_id"] = metadata.strategyId.slice(0, 160);
  if (metadata.constructBypass !== undefined) attributes["guardian.construct_bypass"] = metadata.constructBypass;
  if (metadata.repairMechanism) attributes["guardian.repair_mechanism"] = metadata.repairMechanism.slice(0, 160);
  if (metadata.reattackOutcome) attributes["guardian.reattack_outcome"] = metadata.reattackOutcome;
  if (metadata.finalWorkflowStatus) attributes["guardian.final_workflow_status"] = metadata.finalWorkflowStatus.slice(0, 160);
  if (durationMs !== undefined) attributes["guardian.duration_ms"] = Math.max(0, Math.round(durationMs));
  return attributes;
}

class AgentCoreRunObservability implements RunObservability {
  readonly mode = "AMAZON_BEDROCK_AGENTCORE" as const;
  private readonly driver: TelemetryDriver;
  constructor(driver: TelemetryDriver) { this.driver = driver; }

  async traceRun<T>(operation: (session: RunTraceSession) => Promise<T>): Promise<T> {
    let domainStarted = false;
    let domainSettled = false;
    let domainResult: T | undefined;
    let domainError: unknown;
    try {
      const result = await this.driver.withRoot(ROOT_TRACE_NAME, { "guardian.observability": "amazon-bedrock-agentcore" }, async (rootSpan) => {
        domainStarted = true;
        const session: RunTraceSession = {
          startStage: (stage, metadata = {}): ObservedStage => {
            const startedAt = performance.now();
            let span: TelemetrySpan | undefined;
            try { span = this.driver.startSpan(`construct_guardian.${stage}`, safeAttributes(stage, metadata)); }
            catch { return { finish() {} }; }
            return {
              finish: (finalMetadata = {}) => {
                try {
                  const combined = { ...metadata, ...finalMetadata };
                  span?.setAttributes(safeAttributes(stage, combined, performance.now() - startedAt));
                  span?.setSuccess(combined.success !== false);
                  span?.end();
                } catch {}
              },
            };
          },
        };
        try {
          domainResult = await operation(session);
          domainSettled = true;
          try { rootSpan.setSuccess(true); } catch {}
          return domainResult;
        } catch (error) {
          domainError = error;
          domainSettled = true;
          try { rootSpan.setSuccess(false); } catch {}
          throw error;
        }
      });
      return result;
    } catch {
      if (domainSettled) {
        if (domainError !== undefined) throw domainError;
        return domainResult as T;
      }
      if (!domainStarted) return operation(NOOP_TRACE_SESSION);
      return operation(NOOP_TRACE_SESSION);
    }
  }
}

export function createAgentCoreObservability(options: { enabled?: boolean; driver?: TelemetryDriver } = {}): RunObservability {
  const enabled = options.enabled ?? process.env.AGENTCORE_OBSERVABILITY_ENABLED === "true";
  if (!enabled) return NOOP_OBSERVABILITY;
  try {
    const driver = options.driver ?? new OpenTelemetryDriver(trace.getTracer(INSTRUMENTATION_NAME));
    return new AgentCoreRunObservability(driver);
  } catch { return NOOP_OBSERVABILITY; }
}

export { safeStartStage };
