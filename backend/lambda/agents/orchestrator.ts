import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { Langfuse } from 'langfuse';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AUTH_TOKEN });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

const langfuse = new Langfuse({
  baseUrl: process.env.LANGFUSE_BASE_URL,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
});

// Default coordinator for this portfolio build — in production this would
// come from a member-coordinator assignment table
const DEFAULT_COORDINATOR = 'coordinator-001';

const invoke = (functionName: string, payload: object) =>
  lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

export const handler = async () => {
  const trace = langfuse.trace({ name: 'orchestrator-nightly-run' });
  // Step 1: get all members from the LUT
  const membersResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'MEMBERS' },
    }),
  );

  const members = membersResult.Items ?? [];
  if (members.length === 0) return { message: 'No members found' };

  const results: Record<string, unknown>[] = [];

  for (const member of members) {
    const memberId = member.memberId;

    // Step 2: fetch all member data in parallel for triage
    const [dischargeResult, diagnosisResult, rxResult] = await Promise.all([
      dynamo.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `MEMBER#${memberId}`, ':prefix': 'DISCHARGE#' },
        }),
      ),
      dynamo.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `MEMBER#${memberId}`, ':prefix': 'DIAGNOSIS#' },
        }),
      ),
      dynamo.send(
        new QueryCommand({
          TableName: process.env.TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': `MEMBER#${memberId}`, ':prefix': 'RX#' },
        }),
      ),
    ]);

    const discharges = dischargeResult.Items ?? [];
    const diagnoses = diagnosisResult.Items ?? [];
    const prescriptions = rxResult.Items ?? [];

    // Step 3: triage pass — rules only, no Bedrock
    const recentDischarge = discharges.find((d) => {
      const days = (Date.now() - new Date(d.dischargeDate).getTime()) / (1000 * 60 * 60 * 24);
      return days <= d.readmissionWindowDays;
    });

    const hasOverdue = prescriptions.some((rx) => rx.refillStatus === 'overdue');
    const hasDiagnoses = diagnoses.length > 0;
    const hasDrugNamesForFormulary = prescriptions.length > 0;

    // Step 4: for each eligible agent, check operational memory then invoke
    if (recentDischarge) {
      const check = await invoke(process.env.CHECK_CASES_FUNCTION!, {
        memberId,
        agentType: 'READMISSION',
      });
      const decision = JSON.parse(Buffer.from(check.Payload!).toString());
      if (decision.decision === 'proceed') {
        await invoke(process.env.READMISSION_RISK_FUNCTION!, {
          memberId,
          coordinatorId: DEFAULT_COORDINATOR,
        });
        results.push({ memberId, agent: 'READMISSION', action: 'invoked' });
      } else {
        results.push({ memberId, agent: 'READMISSION', action: decision.decision });
      }
    }

    if (hasDiagnoses) {
      const check = await invoke(process.env.CHECK_CASES_FUNCTION!, {
        memberId,
        agentType: 'GAP_IN_CARE',
      });
      const decision = JSON.parse(Buffer.from(check.Payload!).toString());
      if (decision.decision === 'proceed') {
        await invoke(process.env.GAP_IN_CARE_FUNCTION!, {
          memberId,
          coordinatorId: DEFAULT_COORDINATOR,
        });
        results.push({ memberId, agent: 'GAP_IN_CARE', action: 'invoked' });
      } else {
        results.push({ memberId, agent: 'GAP_IN_CARE', action: decision.decision });
      }
    }

    if (hasOverdue) {
      const check = await invoke(process.env.CHECK_CASES_FUNCTION!, {
        memberId,
        agentType: 'REFILL',
      });
      const decision = JSON.parse(Buffer.from(check.Payload!).toString());
      if (decision.decision === 'proceed') {
        await invoke(process.env.REFILL_AGENT_FUNCTION!, {
          memberId,
          coordinatorId: DEFAULT_COORDINATOR,
        });
        results.push({ memberId, agent: 'REFILL', action: 'invoked' });
      } else {
        results.push({ memberId, agent: 'REFILL', action: decision.decision });
      }
    }

    if (hasDrugNamesForFormulary) {
      const check = await invoke(process.env.CHECK_CASES_FUNCTION!, {
        memberId,
        agentType: 'FORMULARY_SWITCH',
      });
      const decision = JSON.parse(Buffer.from(check.Payload!).toString());
      if (decision.decision === 'proceed') {
        await invoke(process.env.FORMULARY_SWITCH_FUNCTION!, {
          memberId,
          coordinatorId: DEFAULT_COORDINATOR,
          planId: 'plan-001',
        });
        results.push({ memberId, agent: 'FORMULARY_SWITCH', action: 'invoked' });
      } else {
        results.push({ memberId, agent: 'FORMULARY_SWITCH', action: decision.decision });
      }
    }
  }

  // Start Langfuse
  const generation = trace.generation({
    name: 'morning-briefing',
    model: 'claude-haiku-4-5-20251001',
    input: results,
  });

  // Step 5: morning briefing via Claude
  const briefingResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are a care coordination assistant. Summarize the following agent actions
into a concise morning briefing for care coordinators. Group by urgency: CRITICAL, URGENT, ROUTINE.
Keep it professional and actionable.`,
    messages: [
      {
        role: 'user',
        content: `Agent actions taken this run: ${JSON.stringify(results)}`,
      },
    ],
  });

  const textBlock = briefingResponse.content.find((b) => b.type === 'text');
  const briefing = textBlock?.text ?? 'No briefing generated';

  // End Langfuse
  generation.end({
    output: briefing,
    usage: {
      input: briefingResponse.usage.input_tokens,
      output: briefingResponse.usage.output_tokens,
    },
  });

  await langfuse.flushAsync();
  return { results, briefing };
};
