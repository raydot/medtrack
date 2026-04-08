import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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

export interface FormularySwitchInput {
  memberId: string;
  coordinatorId: string;
  planId: string;
  traceId?: string;
  parentObservationId?: string;
}

export const handler = async (event: FormularySwitchInput) => {
  // Step 1: get member's prescriptions
  const rxResult = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `MEMBER#${event.memberId}`,
        ':prefix': 'RX#',
      },
    }),
  );

  const prescriptions = rxResult.Items ?? [];
  if (prescriptions.length === 0) return { skipped: true, reason: 'no prescriptions' };

  // Step 2: check each prescription against the formulary
  const formularyChecks = await Promise.all(
    prescriptions.map((rx) =>
      dynamo.send(
        new GetCommand({
          TableName: process.env.FORMULARY_TABLE_NAME,
          Key: {
            PK: `DRUG#${rx.drugName.toLowerCase()}`,
            SK: `PLAN#${event.planId}`,
          },
        }),
      ),
    ),
  );

  // Find prescriptions where the drug has changed tier recently
  const affectedDrugs = formularyChecks
    .map((result, i) => ({ formulary: result.Item, rx: prescriptions[i] }))
    .filter(({ formulary }) => formulary?.previousTier !== undefined);

  if (affectedDrugs.length === 0)
    return { skipped: true, reason: 'no formulary changes affect this member' };

  const generation = langfuse.generation({
    traceId: event.traceId,
    parentObservationId: event.parentObservationId,
    name: 'gap-in-care-analysis',
    model: 'claude-haiku-4-5-20251001',
    input: { affectedDrugs: affectedDrugs.map(({ rx }) => rx.drugName) },
  });

  // Step 3: ask Claude to select best alternative and draft outreach
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are a pharmacy benefit specialist. A member's medication has changed formulary
tier. Review the situation and draft a brief, professional outreach message to the prescriber
suggesting a covered alternative. Be factual and concise. Do not make clinical recommendations
beyond formulary tier information.
Respond with JSON: { "recommendedAlternative": "drug name", "urgency": "routine|urgent", "outreachDraft": "..." }`,
    messages: [
      {
        role: 'user',
        content: `Affected medications and formulary changes:
${JSON.stringify(
  affectedDrugs.map(({ formulary, rx }) => ({
    drug: rx.drugName,
    previousTier: formulary?.previousTier,
    currentTier: formulary?.tier,
    alternatives: formulary?.alternatives,
  })),
)}

Draft outreach to the prescriber explaining the formulary change and suggesting the best
covered alternative.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  let recommendedAlternative = '';
  let urgency: 'routine' | 'urgent' = 'routine';
  let outreachDraft = '';

  try {
    const parsed = JSON.parse(textBlock?.text ?? '{}');
    recommendedAlternative = parsed.recommendedAlternative ?? '';
    urgency = parsed.urgency ?? 'routine';
    outreachDraft = parsed.outreachDraft ?? '';
  } catch {
    outreachDraft = textBlock?.text ?? 'Unable to parse response';
  }

  // Step 4: open a case with the outreach draft attached
  await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.OPEN_CASE_FUNCTION,
      Payload: Buffer.from(
        JSON.stringify({
          memberId: event.memberId,
          coordinatorId: event.coordinatorId,
          agentType: 'FORMULARY_SWITCH',
          urgency,
          reasoning: `Recommended alternative: ${recommendedAlternative}\n\nDraft outreach:\n${outreachDraft}`,
        }),
      ),
    }),
  );

  generation.end({
    output: outreachDraft,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  });

  await langfuse.flushAsync();

  return { memberId: event.memberId, urgency, recommendedAlternative, outreachDraft };
};
