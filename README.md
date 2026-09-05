
````markdown
# Construct Guardian — Assessment Attack Agent

**Can AI earn the grade without demonstrating the learning?**

Construct Guardian is a **pre-deployment assessment validity stress-testing agent** for teachers, course designers, and assessment teams.

It is used **before an assessment is released to students**, so the instructor can examine whether the task still produces credible learner-originated evidence when generative AI can participate in completing the work.

Instead of asking:

> Did the student use AI?

Construct Guardian asks:

> Can an AI-assisted strategy satisfy the assignment and rubric while bypassing the learner-originated evidence the assessment was supposed to measure?

The system models the intended construct, attacks the assessment with plausible AI-assisted completion strategies, identifies Construct Bypass, proposes the smallest evidence-targeted repair, and then re-runs the exact same successful exploit against the repaired assessment.

---

## Why this matters

Generative AI can now produce polished assignments that score highly against conventional rubrics.

But a high-quality submission does not necessarily mean the learner demonstrated the intended skill.

An assessment may still appear rigorous while allowing AI to perform the very reasoning, evidence selection, interpretation, or justification that the course intended to measure.

Construct Guardian helps instructors test that risk **before the assessment is deployed**.

It is not:

- an AI detector
- a plagiarism checker
- a student-surveillance tool
- a post-submission student-answer analyzer
- a generic teacher chatbot

It is an **assessment validity stress test**.

---

## Core concept: Construct Bypass

**Construct Bypass** is a product-specific operational term:

> A condition in which an assessment can be successfully completed, often with AI assistance, while bypassing the human evidence required to support the intended learning construct.

Construct Guardian does not present Construct Bypass as an established psychometric term.

The system makes bypass visible by separating:

- **Submission Quality**
- **Human Evidence Retained**
- **Bypass Score**

This prevents a polished artifact from being mistaken for evidence of learning.

---

## Intended workflow

`Learning Outcome + Assignment + Rubric → Construct & Human Evidence Model → Adversarial Assessment Stress Test → Construct Bypass Detection → Smallest Repair → Exact Re-Attack → Final Validity Result`

The teacher remains the decision-maker and reviews the strengthened assessment before it is deployed to students.

---

## How it works

### 1. Input received

The instructor provides:

- Learning Outcome
- Assignment Prompt
- Rubric

### 2. Construct modeled

The **Construct Analyst** identifies:

- the intended construct
- required learner evidence
- construct-bearing task steps
- evidence weights

### 3. Attack executed

The **Assessment Attacker** generates multiple plausible AI-assisted completion strategies.

Examples include:

- preparation assistance
- partial reasoning substitution
- near-total AI completion

### 4. Submission quality evaluated

The **Quality Evaluator** evaluates the simulated submission against the rubric using structured criterion-level outputs.

The deterministic Guardian Engine calculates the final weighted quality score.

### 5. Construct bypass evaluated

The Guardian Engine calculates how much learner-originated evidence remains.

It determines:

- submission quality
- retained human evidence
- bypass score
- whether configured thresholds are crossed

If both quality and bypass thresholds are crossed, the system reports:

**CONSTRUCT BYPASS FOUND**

### 6. Smallest repair proposed

The **Repair Agent** identifies the evidence that was lost and proposes the smallest targeted modification that can restore an attributable learner sample.

The goal is not to redesign the whole assessment.

The repair is tied directly to the bypassed evidence.

### 7. Exact strategy re-attack

The system re-runs the **same successful attack strategy** against the repaired assessment.

No easier or different attack is substituted.

### 8. Final result

If that exact exploit can no longer complete the protected learner-originated requirement:

**BYPASS CLOSED**

Otherwise:

**STILL VULNERABLE**

---

## Interactive assessment-validity report

The primary output is an **interactive validity report inside the application**.

It includes:

1. Assessment Overview
2. Intended Construct
3. Required Human Evidence
4. Attack Strategies Tested
5. Submission Quality
6. Human Evidence Retained
7. Construct Bypass Analysis
8. Smallest Repair
9. Exact Re-Attack Result
10. Full Trace / Why This Result

The trace keeps the final decision auditable by showing the construct model, evidence mapping, attack identity, deterministic calculations, repair decision, and re-attack outcome.

---

## Golden Demo

The Golden Demo uses a persuasive campaign analysis task.

The assessment requires students to:

- identify persuasive strategies
- select textual evidence
- justify the evidence–strategy relationship
- consider an alternative interpretation

A near-total AI completion strategy produces:

- **Submission Quality: 94%**
- **Human Evidence Retained: 0%**
- **Bypass Score: 100%**

Result:

**CONSTRUCT BYPASS FOUND**

Construct Guardian then proposes one bounded repair:

> After submission, complete one 8-minute in-class response to a newly supplied campaign excerpt: identify one strategy, select one quotation, justify the connection, and note one plausible alternative reading.

The exact `full-generation` strategy is then re-run.

It can still generate the original written submission, but it cannot complete the protected learner-originated in-class response.

Result:

**BYPASS CLOSED**

The original evidence map and bypass arithmetic remain traceable rather than being artificially reduced after repair.

---

## Example presets

Construct Guardian currently includes three ready-to-run examples.

### Golden Demo

Persuasive campaign analysis.

### Pragmatic Meaning Analysis

Focuses on:

- implied meaning
- linguistic cues
- contextual reasoning
- evidence-based interpretation

### Statistical Interpretation

Focuses on:

- quantitative result interpretation
- evidence-based conclusions
- inferential judgment
- limitations

These examples demonstrate that the workflow is not tied to a single subject area.

---

## Architecture

Construct Guardian uses a hybrid architecture that separates **model-driven reasoning** from **deterministic validity decisions**.

### Strands-powered stages

The following stages are providerized through Strands Agents with Amazon Bedrock support:

- Construct Analyst
- Assessment Attacker
- Quality Evaluator
- Repair Agent

Each stage produces structured, schema-validated output.

### Deterministic Guardian Engine

The Guardian Engine owns the decisions that should not depend on model judgment:

- evidence-weight arithmetic
- retained-human-evidence calculation
- bypass scoring
- thresholds
- workflow state
- illegal transition guards
- attack identity
- exact-strategy re-attack
- human-only requirement handling
- final bypass status

**AI generates and reasons; the engine verifies and decides.**

The LLM does not control the final bypass calculation.

---

## Architecture Diagram

![Construct Guardian Architecture](./docs/construct-guardian-architecture.png)

---

## Technology

- Next.js
- React
- TypeScript
- Strands Agents SDK
- Amazon Bedrock
- Zod structured validation
- Deterministic Guardian Engine
- OpenTelemetry-compatible observability adapter

---

## Observability

Construct Guardian includes a server-side observability adapter for tracing the workflow across stages such as:

- construct analysis
- assessment attack
- quality evaluation
- construct bypass evaluation
- repair proposal
- exact-strategy re-attack
- final outcome

The adapter is designed to support AgentCore-compatible observability without making telemetry failures affect product behavior.

Raw prompts, raw submissions, credentials, and sensitive runtime details are not included in trace metadata.

> Live AgentCore export should only be claimed when the corresponding runtime configuration has been verified.

---

## Reliability and fallback behavior

Each AI-powered stage has a deterministic fallback.

If Amazon Bedrock is unavailable or runtime credentials are not configured, the system remains usable and exposes the fallback source in the trace rather than silently pretending that a live model was used.

This keeps runtime provenance visible.

---

## Workflow state machine

```text
INGESTED
  ↓
CONSTRUCT_MODELED
  ↓
ATTACK_EXECUTED
  ↓
BYPASS_CONFIRMED / NO_BYPASS
  ↓
REPAIR_PROPOSED
  ↓
REATTACKED
  ↓
BYPASS_CLOSED / STILL_VULNERABLE
````

Illegal transitions are guarded by deterministic workflow rules.

---

## Design principles

* Pre-deployment rather than post-submission
* Evidence-centered rather than detector-centered
* Minimal repair rather than complete redesign
* Exact-strategy verification
* Deterministic scoring and thresholds
* Transparent provenance
* Structured model outputs
* Graceful fallback behavior
* Teacher remains the final decision-maker

---

## Live Demo

Construct Guardian is available as a live interactive application:

[https://constructguardian.humanaixlab.com](https://constructguardian.humanaixlab.com)

---

## Demo Video

Final demo video link will be added before submission.

---

## Running locally

### Requirements

* Node.js 20+
* AWS credentials available through the standard AWS credential provider chain
* Amazon Bedrock access in the configured region

### Environment

Copy:

```bash
cp .env.example .env.local
```

Default configuration:

```env
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6
```

Do not hard-code AWS credentials.

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Production build

```bash
npm run build
```

---

## Verification status

Current verified application state:

* **87 tests passing**
* **ESLint passing**
* **Production build passing**
* **Working tree clean**

Latest verified application commit:

`a7bed8c247ededee521697cbaf93b2980fca7af7`

---

## Hackathon Track

**Professional Agents**

Construct Guardian helps teachers and course designers perform a judgment-heavy professional task more systematically: evaluating whether an assessment still measures the intended learning when AI can participate in task completion.

---

## Current AWS status

Live Amazon Bedrock inference has been successfully verified in `us-east-1` using Anthropic Claude Sonnet 4.6 through the global cross-region model profile.

The live smoke test returned:

`BEDROCK_OK`

The application uses Strands-powered providers for AI reasoning stages, while the deterministic Guardian Engine retains control of evidence arithmetic, thresholds, workflow state, exact-strategy re-attack, and final bypass status.

Deterministic fallback providers remain available for resilience when live model access is unavailable.

---

## Repository

GitHub repository:

[https://github.com/humanaixlab/construct-guardian](https://github.com/humanaixlab/construct-guardian)

---

## License

MIT

```

```
