import { analyzeConstruct } from "@/lib/construct/analyst";
import { StrandsConstructAnalyst } from "@/lib/construct/strands.server";
import { StrandsAssessmentAttacker } from "@/lib/attacker/strands.server";
import { StrandsQualityEvaluator } from "@/lib/quality/strands.server";
import { StrandsRepairAgent } from "@/lib/repair/strands.server";
import type { AssessmentInput } from "@/lib/guardian";
import { runGuardianWithProviders } from "@/lib/workflow.server";

export async function POST(request: Request) {
  try {
    const input = await request.json() as AssessmentInput;
    const analysis = await analyzeConstruct(input, new StrandsConstructAnalyst());
    const run = await runGuardianWithProviders(input, analysis, { attacker: new StrandsAssessmentAttacker(), quality: new StrandsQualityEvaluator(), repair: new StrandsRepairAgent() });
    return Response.json(run);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Construct analysis failed." }, { status: 400 });
  }
}
