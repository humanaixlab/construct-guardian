"use client";
import { useMemo, useState } from "react";
import { ShieldCheck, Swords, Wrench, RotateCcw, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GOLDEN_DEMO, runGuardian, toPercent, type AssessmentInput, type AttackResult } from "@/lib/guardian";

const labels: Record<string, string> = { INGESTED: "Input received", CONSTRUCT_MODELED: "Construct modeled", ATTACK_EXECUTED: "Attack executed", BYPASS_CONFIRMED: "Bypass confirmed", NO_BYPASS: "No bypass", REPAIR_PROPOSED: "Repair proposed", REATTACKED: "Re-attacked", BYPASS_CLOSED: "Bypass closed", STILL_VULNERABLE: "Still vulnerable" };
function Metric({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "danger" | "safe" }) { return <div className={`metric metric-${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function EvidenceMap({ attack, run }: { attack: AttackResult; run: ReturnType<typeof runGuardian> }) {
  return <div className="evidence-map">{run.construct.requiredEvidence.map((item) => { const retained = attack.retainedEvidenceIds.includes(item.id); return <div className="evidence-row" key={item.id}><span className={retained ? "evidence-dot retained" : "evidence-dot bypassed"}/><div><strong>{item.label}</strong><small>{retained ? "Human performance retained" : "Bypassed by AI"}</small></div><b>{toPercent(item.weight)}</b></div>; })}<div className="formula">Bypass = 100% − retained weights ({toPercent(attack.humanEvidenceRetained)}) = <strong>{toPercent(attack.bypassScore)}</strong></div></div>;
}
export default function GuardianApp() {
  const [input, setInput] = useState<AssessmentInput>(GOLDEN_DEMO); const [run, setRun] = useState<ReturnType<typeof runGuardian> | null>(null); const [error, setError] = useState<string | null>(null); const [running, setRunning] = useState(false);
  const vulnerable = useMemo(() => run?.successfulAttack?.bypassedEvidenceIds.map((id) => run.construct.requiredEvidence.find((e) => e.id === id)?.label).filter(Boolean) ?? [], [run]);
  async function attack() {
    setError(null); setRunning(true); setRun(null);
    try {
      const response = await fetch("/api/analyze-construct", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error(`Construct Analyst endpoint failed (${response.status}).`);
      const completedRun = await response.json() as ReturnType<typeof runGuardian>;
      setRun(completedRun);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Construct Analyst endpoint unavailable.";
      try { setRun(runGuardian(input, undefined, { provider: "DETERMINISTIC_FALLBACK", fallbackReason: reason })); }
      catch (workflowError) { setError(workflowError instanceof Error ? workflowError.message : "The workflow failed."); }
    } finally { setRunning(false); }
  }
  return <main><header className="topbar"><div className="brand"><span className="brand-mark"><ShieldCheck size={19}/></span><div><b>Construct Guardian</b><small>Assessment Attack Agent</small></div></div><span className="mvp-tag">WORKING MVP</span></header>
    <section className="intro"><p className="eyebrow">RED-TEAM THE ASSESSMENT, NOT THE STUDENT</p><h1>Can AI earn the grade<br/>without proving the learning?</h1><p>Model the intended human evidence, attack the task, apply the smallest repair, and re-run the exact same attack.</p></section>
    <div className="workspace"><section className="input-panel"><div className="panel-title"><span>01</span><div><h2>Assessment input</h2><p>Golden Demo is loaded and ready.</p></div></div>
      <label>Learning Outcome<Textarea value={input.learningOutcome} onChange={(e) => setInput({...input, learningOutcome:e.target.value})}/></label>
      <label>Assignment Prompt<Textarea value={input.assignmentPrompt} onChange={(e) => setInput({...input, assignmentPrompt:e.target.value})}/></label>
      <label>Rubric<Textarea className="rubric" value={input.rubric} onChange={(e) => setInput({...input, rubric:e.target.value})}/></label>
      <div className="input-actions"><Button variant="ghost" onClick={() => {setInput(GOLDEN_DEMO);setRun(null);}}><RotateCcw/> Reset demo</Button><Button className="attack-button" onClick={attack} disabled={running}><Swords/>{running ? "ATTACKING…" : "ATTACK ASSESSMENT"}</Button></div>
      {error && <div className="error"><AlertTriangle size={18}/><div><b>Workflow failed</b><p>{error}</p></div></div>}
    </section><section className={`results-panel ${run ? "has-results" : ""}`}>
      {!run && !running && <div className="empty-state"><Swords size={42}/><h2>Ready to attack</h2><p>The system will run all seven stages and expose every calculation.</p></div>}
      {running && <div className="empty-state"><div className="radar"><span/></div><h2>Attacking assessment…</h2><p>Construct → strategies → evidence map → repair → re-attack</p></div>}
      {run && <><div className="state-track">{run.states.map((state, i) => <span key={state} className={state === "BYPASS_CONFIRMED" ? "warn" : state === "BYPASS_CLOSED" ? "closed" : ""}>{i + 1}. {labels[state]}</span>)}</div>
        {run.successfulAttack ? <><div className="verdict danger-verdict"><p>ATTACK RESULT</p><h2>High-quality submission achieved</h2><div className="signal"><Swords/><div><strong>CONSTRUCT BYPASS FOUND</strong><span>{run.successfulAttack.name} crossed both configured thresholds.</span></div></div></div>
          <div className="metrics"><Metric label="Submission quality" value={toPercent(run.successfulAttack.qualityScore)}/><Metric label="Human evidence retained" value={toPercent(run.successfulAttack.humanEvidenceRetained)} tone="danger"/><Metric label="Bypass score" value={toPercent(run.successfulAttack.bypassScore)} tone="danger"/></div><Progress value={run.successfulAttack.bypassScore * 100} className="danger-progress"/>
          <div className="vulnerable"><span>Vulnerable evidence</span>{vulnerable.map((item) => <b key={item}>{item}</b>)}</div>
          <div className="repair-flow"><div className="flow-card"><Wrench/><div><small>SMALLEST REPAIR</small><h3>{run.repair?.title}</h3><p>{run.repair?.change}</p></div></div><ChevronDown className="flow-arrow"/><div className="flow-card"><RotateCcw/><div><small>EXACT STRATEGY RE-RUN</small><h3>{run.reattack?.name}</h3><p>No easier attack substituted. Strategy ID: <code>{run.reattack?.id}</code></p></div></div></div>
          {run.reattack && <div className={`verdict ${run.reattack.bypassDetected ? "danger-verdict" : "safe-verdict"}`}><p>RE-ATTACK RESULT</p><h2>{run.reattack.bypassDetected ? "STILL VULNERABLE" : "BYPASS CLOSED"}</h2>{run.reattack.blockedByHumanOnlyRequirement && <div className="blocked-banner"><AlertTriangle/><div><strong>BLOCKED_BY_HUMAN_ONLY_REQUIREMENT</strong><span>The exact exploit produced the submission but could not complete the accepted learner-originated requirement.</span></div></div>}<div className="metrics compact"><Metric label="Quality" value={toPercent(run.reattack.qualityScore)}/><Metric label="Evidence retained" value={toPercent(run.reattack.humanEvidenceRetained)} tone="safe"/><Metric label="Bypass" value={toPercent(run.reattack.bypassScore)} tone="safe"/></div></div>}
        </> : <div className="verdict safe-verdict"><p>ATTACK RESULT</p><h2>No construct bypass detected</h2><p>No strategy crossed both configured thresholds. Repair was not run.</p></div>}
        <Accordion type="single" collapsible className="trace-panel"><AccordionItem value="trace"><AccordionTrigger>INSPECT FULL TRACE</AccordionTrigger><AccordionContent>
          <div className="trace-section"><h3>1 · Construct model</h3><p className="provenance"><strong>Construct Analyst:</strong> {run.analyst.provider === "STRANDS_BEDROCK" ? "Strands + Amazon Bedrock" : "Deterministic fallback"}</p><p className="provenance"><strong>Observability:</strong> {run.observability?.provider === "AMAZON_BEDROCK_AGENTCORE" ? "Amazon Bedrock AgentCore" : "Local/no-op"}</p>{run.analyst.fallbackReason && <p><strong>Fallback reason:</strong> {run.analyst.fallbackReason}</p>}<pre>{JSON.stringify(run.construct, null, 2)}</pre></div>
          <div className="trace-section"><h3>2 · All attack strategies</h3><p className="provenance"><strong>Assessment Attacker:</strong> {run.attacker.provider === "STRANDS_BEDROCK" ? "Strands + Amazon Bedrock" : "Deterministic fallback"} · <strong>Quality Evaluator:</strong> {run.quality.provider === "STRANDS_BEDROCK" ? "Strands + Amazon Bedrock" : "Deterministic fallback"}</p>{run.attacker.fallbackReason && <p><strong>Attacker fallback:</strong> {run.attacker.fallbackReason}</p>}{run.quality.fallbackReason && <p><strong>Quality fallback:</strong> {run.quality.fallbackReason}</p>}{run.attacks.map((item) => <div className="trace-attack" key={item.id}><h4>{item.name} · quality {toPercent(item.qualityScore)}</h4><p>{item.aiRole}</p><EvidenceMap attack={item} run={run}/><details><summary>Simulated submission</summary><p>{item.simulatedSubmission}</p></details></div>)}</div>
          {run.successfulAttack && <div className="trace-section"><h3>3 · Successful attack selected</h3><p>Highest bypass among strategies crossing quality ≥ {toPercent(run.thresholds.highQuality)} and bypass ≥ {toPercent(run.thresholds.substantialBypass)}.</p><code>{run.successfulAttack.id}</code></div>}
          {run.repair && <div className="trace-section"><h3>4 · Repair</h3><p className="provenance"><strong>Repair Agent:</strong> {run.repairAgent?.provider === "STRANDS_BEDROCK" ? "Strands + Amazon Bedrock" : "Deterministic fallback"}</p>{run.repairAgent?.fallbackReason && <p><strong>Fallback reason:</strong> {run.repairAgent.fallbackReason}</p>}<pre>{JSON.stringify(run.repair, null, 2)}</pre></div>}
          {run.reattack && <div className="trace-section"><h3>5 · Re-attack</h3><p>Original: <code>{run.successfulAttack?.id}</code> · Re-attack: <code>{run.reattack.id}</code></p><div className="attempt-list">{run.reattack.requirementAttempts.map((attempt) => <div className={attempt.status === "BLOCKED_BY_HUMAN_ONLY_REQUIREMENT" ? "attempt blocked" : "attempt"} key={attempt.requirementId}><b>{attempt.status}</b><span>{attempt.requirement}</span><small>{attempt.explanation}</small></div>)}</div><EvidenceMap attack={run.reattack} run={run}/><p><strong>Closure reason:</strong> the score remains traceable to the original evidence map; the bypass closes because the exploit cannot complete the protected human-only requirement.</p></div>}
        </AccordionContent></AccordionItem></Accordion>
      </>}
    </section></div><footer>Deterministic scoring · Thresholds: quality ≥ 75% and bypass ≥ 50% · No data is stored</footer></main>;
}
