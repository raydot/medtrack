import * as fs from 'fs';
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

interface AgentResult {
  memberId?: string;
  agent: string;
  action: string;
}

interface OrchestratorOutput {
  results: AgentResult[];
  briefing: string;
  traceId?: string;
}

async function evaluate() {
  const outputPath = process.env.ORCHESTRATOR_OUTPUT ?? '/tmp/orchestrator-output.json';
  const raw = fs.readFileSync(outputPath, 'utf-8');
  const output: OrchestratorOutput = JSON.parse(raw);
  const { results } = output;

  // Extract traceId from the output if the Orchestrator attached it
  // For now we attach scores without a traceId — Langfuse will create a new trace
  const checks = [
    {
      id: 'qm-01',
      name: 'control-member-no-invocations',
      pass: !results.some((r) => r.memberId === 'member-654' && r.action === 'invoked'),
      comment:
        'member-654 has no diagnoses, discharge, or overdue meds — zero invocations expected',
    },
    {
      id: 'qm-02',
      name: 'gap-in-care-member-new-001',
      pass: results.some(
        (r) =>
          r.memberId === 'member-new-001' && r.agent === 'GAP_IN_CARE' && r.action === 'invoked',
      ),
      comment: 'member-new-001 has Hypertension with no BP medication — Gap in Care must fire',
    },
    {
      id: 'qm-03',
      name: 'readmission-risk-member-789',
      pass: results.some(
        (r) => r.memberId === 'member-789' && r.agent === 'READMISSION' && r.action === 'invoked',
      ),
      comment: 'member-789 discharged 10 days ago — Readmission Risk must fire',
    },
    {
      id: 'qm-04',
      name: 'briefing-contains-urgency-sections',
      pass: ['CRITICAL', 'URGENT', 'ROUTINE'].every((section) => output.briefing.includes(section)),
      comment:
        'Morning briefing must categorize actions into CRITICAL, URGENT, and ROUTINE sections',
    },
  ];

  console.log('\nEvaluation results\n');
  console.log('─'.repeat(60));

  let failed = 0;

  for (const check of checks) {
    const status = check.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}  [${check.id}] ${check.name}`);
    if (!check.pass) {
      console.log(`       ${check.comment}`);
      failed++;
    }

    langfuse.score({
      traceId: output.traceId,
      name: check.id,
      value: check.pass ? 1 : 0,
      comment: check.comment,
    });
  }

  console.log('─'.repeat(60));
  console.log(`\n${checks.length - failed}/${checks.length} checks passed\n`);

  await langfuse.flushAsync();

  if (failed > 0) {
    console.error(`${failed} quality check(s) failed`);
    process.exit(1);
  }
}

evaluate().catch((err) => {
  console.error(err);
  process.exit(1);
});
