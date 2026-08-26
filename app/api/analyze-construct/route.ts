import { analyzeConstruct } from "@/lib/construct/analyst";
import { StrandsConstructAnalyst } from "@/lib/construct/strands.server";
import type { AssessmentInput } from "@/lib/guardian";

export async function POST(request: Request) {
  try {
    const input = await request.json() as AssessmentInput;
    const result = await analyzeConstruct(input, new StrandsConstructAnalyst());
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Construct analysis failed." }, { status: 400 });
  }
}
