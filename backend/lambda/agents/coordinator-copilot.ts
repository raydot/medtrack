import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import Anthropic from '@anthropic-ai/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AUTH_TOKEN });

const tools = [
  {
    name: 'getMembersByStatus',
    description:
      'Get all members with prescriptions matching a given refill status, optionally filtered by drug class.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['ok', 'due', 'overdue'] },
        drugClass: {
          type: 'string',
          description: 'Optional drug class filter e.g. statins, SSRIs',
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'triggerRefillForMember',
    description: 'Trigger a refill for a specific member and prescription.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memberId: { type: 'string' },
        rxId: { type: 'string' },
      },
      required: ['memberId', 'rxId'],
    },
  },
];

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

async function getMembersByStatus(input: { status: string; drugClass?: string }) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'StatusIndex',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: { ':status': `STATUS#${input.status}` },
    }),
  );

  const items = result.Items ?? [];
  return input.drugClass ? items.filter((item) => item.drugClass === input.drugClass) : items;
}

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

async function triggerRefillForMember(input: { memberId: string; rxId: string }) {
  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: process.env.TRIGGER_REFILL_FUNCTION,
      Payload: Buffer.from(JSON.stringify(input)),
    }),
  );
  return { success: true, ...input };
}

export const handler = async (event: { body: string }) => {
  const { message } = JSON.parse(event.body) as { message: string };
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }];
  let response: Anthropic.Message | undefined;
  while (true) {
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      break;
    }

    // Otherwise: execute tool calls, append results, loop again
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

    // After the for loop, append the assistant turn
    messages.push({ role: 'assistant', content: response.content });
    for (const toolUse of toolUseBlocks) {
      let result: unknown;

      switch (toolUse.name) {
        case 'getMembersByStatus':
          result = await getMembersByStatus(
            toolUse.input as { status: string; drugClass?: string },
          );
          break;
        case 'triggerRefillForMember':
          result = await triggerRefillForMember(
            toolUse.input as { memberId: string; rxId: string },
          );
          break;
      }

      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          },
        ],
      });
    }
  }
  const textBlock = response.content.find((block) => block.type === 'text');
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message: textBlock?.text ?? 'No response' }),
  };
};
