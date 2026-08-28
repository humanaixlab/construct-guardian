import { GOLDEN_DEMO, type AssessmentInput } from "./guardian.ts";

export type AssessmentExampleId = "golden-demo" | "pragmatic-meaning-analysis" | "statistical-interpretation";
export type AssessmentExample = { id: AssessmentExampleId; name: string; input: AssessmentInput };

export const ASSESSMENT_EXAMPLES: readonly AssessmentExample[] = [
  { id: "golden-demo", name: "Golden Demo", input: GOLDEN_DEMO },
  {
    id: "pragmatic-meaning-analysis",
    name: "Pragmatic Meaning Analysis",
    input: {
      learningOutcome: "Analyze how linguistic choices produce implied meaning in context and justify an interpretation using textual evidence.",
      assignmentPrompt: "Analyze the short dialogue provided by the instructor. Identify the implied meaning, explain how one linguistic choice contributes to that interpretation, explain how context shapes the meaning, and support your analysis with two specific linguistic cues from the text.",
      rubric: [
        "Pragmatic interpretation accuracy — 30%",
        "Identification and use of linguistic evidence — 30%",
        "Contextual reasoning — 25%",
        "Clarity of explanation — 15%",
      ].join("\n"),
    },
  },
  {
    id: "statistical-interpretation",
    name: "Statistical Interpretation",
    input: {
      learningOutcome: "Interpret quantitative results and justify conclusions using evidence from the data.",
      assignmentPrompt: "Review the provided experimental results and write a concise report identifying the main result, explaining whether the evidence supports the hypothesis, interpreting the result, and identifying two limitations of the study.",
      rubric: [
        "Accuracy of data interpretation — 30%",
        "Evidence-based justification — 30%",
        "Recognition of limitations — 20%",
        "Clarity and organization — 20%",
      ].join("\n"),
    },
  },
];

export function getAssessmentExample(id: AssessmentExampleId) {
  const example = ASSESSMENT_EXAMPLES.find((candidate) => candidate.id === id);
  if (!example) throw new Error(`Unknown assessment example: ${id}`);
  return { ...example.input };
}
