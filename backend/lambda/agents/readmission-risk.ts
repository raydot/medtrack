import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { Langfuse } from 'langfuse';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AUTH_TOKEN });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

export interface ReadmissionRiskInput {
  memberId: string;
  coordinatorId: string;
  traceId?: string;
  parentObservationId?: string;
}

export const handler = async (event: ReadmissionRiskInput) => {
  // Step 1: fetch discharge records and prescriptions in parallel
  const [dischargeResult, rxResult] = await Promise.all([
    dynamo.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `MEMBER#${event.memberId}`,
          ':prefix': 'DISCHARGE#',
        },
      }),
    ),
    dynamo.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `MEMBER#${event.memberId}`,
          ':prefix': 'RX#',
        },
      }),
    ),
  ]);

  const discharges = dischargeResult.Items ?? [];
  const prescriptions = rxResult.Items ?? [];

  if (discharges.length === 0) return { skipped: true, reason: 'no discharge records' };

  // Most recent discharge only
  const latest = discharges.sort((a, b) => b.dischargeDate.localeCompare(a.dischargeDate))[0];
  const daysSinceDischarge = Math.floor(
    (Date.now() - new Date(latest.dischargeDate).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSinceDischarge > latest.readmissionWindowDays) {
    return { skipped: true, reason: 'outside readmission window' };
  }

  // Calculate fill rate for discharge medications
  const dischargeMedIds: string[] = latest.dischargeMedications.map((m: { S?: string } | string) =>
    typeof m === 'string' ? m : (m.S ?? ''),
  );
  const filledCount = prescriptions.filter(
    (rx) => dischargeMedIds.includes(rx.id) && rx.refillStatus === 'ok',
  ).length;
  const fillRate = dischargeMedIds.length > 0 ? filledCount / dischargeMedIds.length : 1;

  const generation = langfuse.generation({
    traceId: event.traceId,
    parentObservationId: event.parentObservationId,
    name: 'gap-in-care-analysis',
    model: 'claude-haiku-4-5-20251001',
    input: {
      daysSinceDischarge,
      fillRate: Math.round(fillRate * 100),
      admissionReason: latest.admissionReason,
    },
  });

  // Step 2: ask Claude to assign urgency and reasoning
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: `You are a readmission risk analyst. Based on days since discharge and medication
fill rate, assign an urgency tier and explain why. Use these rules:
- routine: discharge < 7 days ago AND fill rate > 75%
- urgent: discharge 7-14 days ago with fill rate < 75%, OR < 7 days with fill rate < 50%
- critical: discharge > 14 days ago with fill rate < 50%
Respond with JSON: { "urgency": "routine|urgent|critical", "reasoning": "..." }`,
    messages: [
      {
        role: 'user',
        content: `Days since discharge: ${daysSinceDischarge}
Admission reason: ${latest.admissionReason}
Discharge medication fill rate: ${Math.round(fillRate * 100)}%`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  let urgency: 'routine' | 'urgent' | 'critical' = 'routine';
  let reasoning = '';

  try {
    const parsed = JSON.parse(textBlock?.text ?? '{}');
    urgency = parsed.urgency ?? 'routine';
    reasoning = parsed.reasoning ?? '';
  } catch {
    reasoning = textBlock?.text ?? 'Unable to parse response';
  }

  // Step 3: open a case
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.OPEN_CASE_FUNCTION,
      Payload: Buffer.from(
        JSON.stringify({
          memberId: event.memberId,
          coordinatorId: event.coordinatorId,
          agentType: 'READMISSION',
          urgency,
          reasoning,
        }),
      ),
    }),
  );

  generation.end({
    output: reasoning,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  });

  await langfuse.flushAsync();

  return { memberId: event.memberId, urgency, reasoning };
};
