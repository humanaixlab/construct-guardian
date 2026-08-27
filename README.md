# Construct Guardian — Assessment Attack Agent

Construct Guardian is a **pre-deployment assessment validity stress-testing
tool** for teachers and course designers. It is used **before an assessment is
given to students**, so the teacher can review and strengthen the assessment
before releasing it.

The primary inputs are:

- Learning Outcome
- Assignment Prompt
- Rubric

From these inputs, Construct Guardian models the intended construct—the
capability the assessment is intended to measure—and the human evidence needed
to support that construct. It then adversarially stress-tests whether
AI-assisted strategies can satisfy the assessment while bypassing the required
human evidence. When it detects a Construct Bypass, it proposes the smallest
evidence-targeted repair and re-runs the exact same successful exploit against
the repaired assessment.

## Construct Bypass

**Construct Bypass** is a product-specific operational term:

> A condition in which an assessment can be successfully completed, often with
> AI assistance, while bypassing the human evidence required to support the
> intended learning construct.

Construct Guardian does not present Construct Bypass as an established
psychometric term.

## Intended workflow

`Learning Outcome + Assignment + Rubric → Construct & Human Evidence Model → Adversarial Assessment Stress Test → Construct Bypass Detection → Interactive Validity Report → Smallest Repair → Exact Re-Attack → Teacher Review → Deploy to Students`

The teacher remains the decision-maker and reviews the strengthened assessment
before it is deployed to students.

## Interactive assessment-validity report

The primary output is an **interactive assessment-validity report inside the
application**. It is not a chatbot conversation and is not merely a
downloadable file. The report contains:

1. **Assessment Overview**
   - Learning Outcome
   - Assignment
   - Rubric
2. **Intended Construct**
   - The capability the assessment is intended to measure
3. **Required Human Evidence**
   - Observable evidence that must originate from the learner
   - Evidence weights and mappings where relevant
4. **Adversarial Stress-Test Results**
   - AI-assisted attack strategies tested
   - Simulated submission quality
   - Human evidence bypassed
   - Whether a Construct Bypass was found
5. **Construct Bypass Analysis**
   - Exact vulnerable evidence
   - Why the assessment can still appear successful
   - Where the validity inference breaks
6. **Smallest Repair**
   - Repair mechanism
   - Repair text
   - Why it matches the lost evidence
   - Why it is minimal
   - Added student burden
7. **Exact Re-Attack Result**
   - The same successful exploit
   - Before/after outcome
   - Whether the exploit was blocked or remains viable
8. **Trace / Why this result**
   - Construct model
   - Evidence mapping
   - Attack identity
   - Deterministic calculations
   - Repair decision
   - Re-attack outcome

## What the current MVP is not

The current MVP is not:

- an AI detector
- a plagiarism checker
- a student-surveillance tool
- a post-submission student-answer analyzer
- a generic teacher chatbot

Future versions may support file upload and automatic extraction, downloadable
revised assessments, and PDF/report export. These capabilities are **not
required for the current MVP**.

Scope lock: no authentication, database, dashboards, integrations, or speculative features.

## Run locally

```bash
npm run dev
```

Run the automated core tests with `npm test`.

## Implemented MVP architecture

- `lib/guardian.ts`: typed contracts, construct model, three attack strategies,
  deterministic scoring, repair, exact-strategy re-attack, and guarded state machine.
- `app/guardian-app.tsx`: one-page working surface with Golden Demo, Before/After,
  failures, and a complete trace panel.
- `tests/guardian.test.ts`: deterministic core and orchestration tests.

The Construct Analyst now uses a server-side Strands Agent with Amazon Bedrock
and validated structured output. It falls back automatically to the deterministic
analyst and records provenance in the existing trace. Attack, scoring, repair,
and re-attack stages remain deterministic simulations.

Copy `.env.example` to `.env.local` and provide AWS credentials through the
standard AWS credential chain. `BEDROCK_MODEL_ID` changes the Bedrock model
without modifying domain logic.

## Starter details

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with
  `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper
  module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can
  prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned
  `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
