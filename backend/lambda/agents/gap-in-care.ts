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

export interface GapInCareInput {
  memberId: string;
  coordinatorId: string;
  traceId?: string;
  parentObservationId?: string;
}

export const handler = async (event: GapInCareInput) => {
  // Step 1: fetch diagnoses and prescriptions in parallel
  const [diagnosisResult, rxResult] = await Promise.all([
    dynamo.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `MEMBER#${event.memberId}`,
          ':prefix': 'DIAGNOSIS#',
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

  const diagnoses = diagnosisResult.Items ?? [];
  const prescriptions = rxResult.Items ?? [];

  if (diagnoses.length === 0) return { skipped: true, reason: 'no diagnoses on record' };

  const generation = langfuse.generation({
    traceId: event.traceId,
    parentObservationId: event.parentObservationId,
    name: 'gap-in-care-analysis',
    model: 'claude-haiku-4-5-20251001',
    input: { diagnoses, prescriptions },
  });

  // Step 2: ask Claude to identify gaps
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are a clinical gap-in-care analyst. You compare a member's diagnoses against
their current medications to identify missing standard-of-care treatments.
Be conservative — only flag clear gaps where a medication class is entirely absent.
Do not diagnose or recommend specific drugs. If no gaps exist, say so clearly.`,
    messages: [
      {
        role: 'user',
        content: `Member diagnoses: ${JSON.stringify(
          diagnoses.map((d) => ({
            condition: d.description,
            expectedMedClasses: d.expectedMedications,
          })),
        )}

Current medications: ${JSON.stringify(
          prescriptions.map((p) => ({
            drug: p.drugName,
          })),
        )}

Are there any diagnoses with no corresponding medication class in the current medication list?`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const reasoning = textBlock?.text ?? 'No response';

  generation.end({
    output: reasoning,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  });

  await langfuse.flushAsync();

  // Step 3: open a case
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.OPEN_CASE_FUNCTION,
      Payload: Buffer.from(
        JSON.stringify({
          memberId: event.memberId,
          coordinatorId: event.coordinatorId,
          agentType: 'GAP_IN_CARE',
          urgency: 'routine',
          reasoning,
        }),
      ),
    }),
  );

  return { memberId: event.memberId, reasoning };
};
