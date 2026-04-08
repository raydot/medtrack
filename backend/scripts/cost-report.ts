import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000;

async function costReport() {
  const traces = await langfuse.api.traceList({ name: 'orchestrator-nightly-run', limit: 10 });

  for (const trace of traces.data) {
    const observations = await langfuse.api.observationsGetMany({ traceId: trace.id });
    const generations = observations.data.filter((o) => o.type === 'GENERATION');

    let inputTokens = 0;
    let outputTokens = 0;

    for (const gen of generations) {
      inputTokens += gen.usage?.input ?? 0;
      outputTokens += gen.usage?.output ?? 0;
    }

    const cost = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

    console.log(`Trace:         ${trace.id}`);
    console.log(`Date:          ${trace.timestamp}`);
    console.log(`Input tokens:  ${inputTokens.toLocaleString()}`);
    console.log(`Output tokens: ${outputTokens.toLocaleString()}`);
    console.log(`Cost:          $${cost.toFixed(4)}`);
    console.log(`Generations:   ${generations.length}`);
    console.log('');
  }
}

costReport().catch(console.error);
