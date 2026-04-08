import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function latencyReport() {
  const traces = await langfuse.api.traceList({ name: 'orchestrator-nightly-run', limit: 50 });
  const latenciesByAgent: Record<string, number[]> = {};

  for (const trace of traces.data) {
    const observations = await langfuse.api.observationsGetMany({ traceId: trace.id });
    const generations = observations.data.filter((o) => o.type === 'GENERATION');

    for (const gen of generations) {
      if (!gen.startTime || !gen.endTime) continue;
      const latencyMs = new Date(gen.endTime).getTime() - new Date(gen.startTime).getTime();
      const name = gen.name?.replace(/ \(.*\)$/, '') ?? 'unknown';
      if (!latenciesByAgent[name]) latenciesByAgent[name] = [];
      latenciesByAgent[name].push(latencyMs);
    }
  }

  console.log('\nLatency report (ms)\n');
  console.log(`${'Agent'.padEnd(35)} ${'p50'.padStart(8)} ${'p95'.padStart(8)} ${'n'.padStart(6)}`);
  console.log('─'.repeat(60));

  for (const [name, latencies] of Object.entries(latenciesByAgent)) {
    const sorted = latencies.sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    console.log(
      `${name.padEnd(35)} ${String(p50).padStart(8)} ${String(p95).padStart(8)} ${String(sorted.length).padStart(6)}`,
    );
  }
}

latencyReport().catch(console.error);
