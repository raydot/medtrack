import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
// import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
// const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const lambda = new LambdaClient({ region: process.env.AWS_REGION });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AUTH_TOKEN });
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

interface RefillAgentInput {
  memberId?: string;
  coordinatorId?: string;
  traceId?: string;
}

const tools = [
  {
    name: 'triggerRefill',
    description: 'Trigger an automatic refill for an overdue prescription.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memberId: { type: 'string', description: 'The member ID' },
        rxId: { type: 'string', description: 'The prescription ID' },
      },
      required: ['memberId', 'rxId'],
    },
  },
  {
    name: 'flagForReview',
    description: 'Flag a prescription for human review instead of automatic refill.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memberId: { type: 'string', description: 'The member ID' },
        rxId: { type: 'string', description: 'The prescription ID' },
        reason: { type: 'string', description: 'Why this needs human review' },
      },
      required: ['memberId', 'rxId', 'reason'],
    },
  },
];

export const handler = async (event: RefillAgentInput) => {
  // Step 1: Get all overdue prescriptions via GSI
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: { ':status': 'STATUS#overdue' },
    }),
  );

  const prescriptions = result.Items ?? [];
  if (prescriptions.length === 0) return { message: 'No overdue prescriptions found' };

  // Step 2: Ask Claude what to do with each one
  // --- Bedrock (restore when quota issue resolved) ---
  // const response = await bedrock.send(
  //   new InvokeModelCommand({
  //     modelId: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
  //     contentType: 'application/json',
  //     accept: 'application/json',
  //     body: JSON.stringify({
  //       anthropic_version: 'bedrock-2023-05-31',
  //       max_tokens: 1000,
  //       tools,
  //       messages: [{ role: 'user', content: `...` }],
  //     }),
  //   }),
  // );
  // const body = JSON.parse(Buffer.from(response.body).toString());
  // const toolCalls = body.content.filter((block: any) => block.type === 'tool_use');
  // --- End Bedrock ---
  //
  const generation = langfuse.generation({
    traceId: event.traceId,
    name: 'refill-agent-decisions',
    model: 'claude-haiku-4-5-20251001',
    input: prescriptions.map((p) => ({ memberId: p.memberId, rxId: p.id, drugName: p.drugName })),
  });

  // --- Anthropic direct (temporary, swap back to Bedrock when quota resolved) ---
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    tools,
    messages: [
      {
        role: 'user',
        content: `You are a medication adherence agent. Review these overdue prescriptions and decide whether to trigger an automatic refill or flag for human review. Use triggerRefill for straightforward cases. Use flagForReview if the prescription has been overdue for an unusually long time (more than 60 days) or if it is a controlled substance class drug. Prescriptions: ${JSON.stringify(prescriptions.map((p) => ({ memberId: p.memberId, rxId: p.id, drugName: p.drugName, lastFillDate: p.lastFillDate, daysSupply: p.daysSupply })))}`,
      },
    ],
  });
  const toolCalls = message.content.filter((block) => block.type === 'tool_use');
  // --- End Anthropic direct ---

  generation.end({
    output: toolCalls.map((t) => ({ tool: t.name, input: t.input })),
    usage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    },
  });

  await langfuse.flushAsync();

  // Step 3: Execute tool calls
  for (const call of toolCalls) {
    const functionName =
      call.name === 'triggerRefill'
        ? process.env.TRIGGER_REFILL_FUNCTION
        : process.env.FLAG_FOR_REVIEW_FUNCTION;

    await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(call.input)),
      }),
    );
  }

  return { processed: toolCalls.length };
};
