import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSESSMENT_EXAMPLES, getAssessmentExample } from "../lib/assessment-examples.ts";
import { GOLDEN_DEMO, THRESHOLDS, calculateEvidenceScore, runGuardian } from "../lib/guardian.ts";

const expected = {
  "golden-demo": GOLDEN_DEMO,
  "pragmatic-meaning-analysis": {
    learningOutcome: "Analyze how linguistic choices produce implied meaning in context and justify an interpretation using textual evidence.",
    assignmentPrompt: "Analyze the short dialogue provided by the instructor. Identify the implied meaning, explain how one linguistic choice contributes to that interpretation, explain how context shapes the meaning, and support your analysis with two specific linguistic cues from the text.",
    rubric: "Pragmatic interpretation accuracy — 30%\nIdentification and use of linguistic evidence — 30%\nContextual reasoning — 25%\nClarity of explanation — 15%",
  },
  "statistical-interpretation": {
    learningOutcome: "Interpret quantitative results and justify conclusions using evidence from the data.",
    assignmentPrompt: "Review the provided experimental results and write a concise report identifying the main result, explaining whether the evidence supports the hypothesis, interpreting the result, and identifying two limitations of the study.",
    rubric: "Accuracy of data interpretation — 30%\nEvidence-based justification — 30%\nRecognition of limitations — 20%\nClarity and organization — 20%",
  },
} as const;

test("all three assessment examples are available", () => {
  assert.deepEqual(ASSESSMENT_EXAMPLES.map(({ id, name }) => ({ id, name })), [
    { id: "golden-demo", name: "Golden Demo" },
    { id: "pragmatic-meaning-analysis", name: "Pragmatic Meaning Analysis" },
    { id: "statistical-interpretation", name: "Statistical Interpretation" },
  ]);
});

test("selecting each example provides the correct Learning Outcome", () => {
  for (const id of Object.keys(expected) as (keyof typeof expected)[]) assert.equal(getAssessmentExample(id).learningOutcome, expected[id].learningOutcome);
});

test("selecting each example provides the correct assignment text", () => {
  for (const id of Object.keys(expected) as (keyof typeof expected)[]) assert.equal(getAssessmentExample(id).assignmentPrompt, expected[id].assignmentPrompt);
});

test("each example preserves its rubric criteria and weights", () => {
  for (const id of Object.keys(expected) as (keyof typeof expected)[]) assert.equal(getAssessmentExample(id).rubric, expected[id].rubric);
});

test("populated fields remain independently editable", () => {
  const first = getAssessmentExample("pragmatic-meaning-analysis");
  first.learningOutcome = "Edited outcome";
  first.assignmentPrompt = "Edited assignment";
  first.rubric = "Edited rubric";
  assert.deepEqual(first, { learningOutcome: "Edited outcome", assignmentPrompt: "Edited assignment", rubric: "Edited rubric" });
  assert.deepEqual(getAssessmentExample("pragmatic-meaning-analysis"), expected["pragmatic-meaning-analysis"]);
});

test("the UI keeps example loading separate from explicit workflow execution", async () => {
  const source = await readFile(new URL("../app/guardian-app.tsx", import.meta.url), "utf8");
  const loader = source.slice(source.indexOf("function loadExample"), source.indexOf("function editInput"));
  assert.match(source, /onChange=\{\(event\) => loadExample/);
  assert.doesNotMatch(loader, /attack\(|fetch\(/);
  assert.match(source, /onClick=\{attack\}/);
});

test("assessment examples do not alter domain calculations", () => {
  assert.deepEqual(THRESHOLDS, { highQuality: 0.75, substantialBypass: 0.5 });
  const run = runGuardian(GOLDEN_DEMO);
  assert.deepEqual(calculateEvidenceScore(run.construct.requiredEvidence, ["identify", "select"]), {
    humanEvidenceRetained: 0.45,
    bypassScore: 0.55,
    contributions: [
      { evidenceId: "identify", label: "Strategy identification", weight: 0.25, retained: true },
      { evidenceId: "select", label: "Evidence selection", weight: 0.2, retained: true },
      { evidenceId: "justify", label: "Evidence–strategy justification", weight: 0.35, retained: false },
      { evidenceId: "alternative", label: "Alternative interpretation", weight: 0.2, retained: false },
    ],
  });
});

test("Golden Demo remains unchanged and completes normally", () => {
  assert.deepEqual(getAssessmentExample("golden-demo"), GOLDEN_DEMO);
  const run = runGuardian(getAssessmentExample("golden-demo"));
  assert.deepEqual(run.states, ["INGESTED", "CONSTRUCT_MODELED", "ATTACK_EXECUTED", "BYPASS_CONFIRMED", "REPAIR_PROPOSED", "REATTACKED", "BYPASS_CLOSED"]);
  assert.equal(run.successfulAttack?.id, "full-generation");
  assert.equal(run.reattack?.id, "full-generation");
});
