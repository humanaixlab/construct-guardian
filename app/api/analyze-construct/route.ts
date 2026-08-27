import { StrandsConstructAnalyst } from "@/lib/construct/strands.server";
import { StrandsAssessmentAttacker } from "@/lib/attacker/strands.server";
import { StrandsQualityEvaluator } from "@/lib/quality/strands.server";
import { StrandsRepairAgent } from "@/lib/repair/strands.server";
import type { AssessmentInput } from "@/lib/guardian";
import { BEDROCK_CONFIG } from "@/lib/construct/bedrock-config.server";
import { createAgentCoreObservability } from "@/lib/observability/agentcore.server";
import { runObservedGuardian } from "@/lib/observability/run.server";

export async function POST(request: Request) {
  try {
    const input = await request.json() as AssessmentInput;
    const observability = createAgentCoreObservability();
    const run = await runObservedGuardian(input, new StrandsConstructAnalyst(), { attacker: new StrandsAssessmentAttacker(), quality: new StrandsQualityEvaluator(), repair: new StrandsRepairAgent() }, observability, BEDROCK_CONFIG.modelId);
    return Response.json(run);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Construct analysis failed." }, { status: 400 });
  }
}
