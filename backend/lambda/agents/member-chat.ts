import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import Anthropic from '@anthropic-ai/sdk';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_AUTH_TOKEN });

// const tools = [
//   {
//     name: 'getMemberPrescriptions',
//     description:
//       'Retrieve the current prescriptions for a member to provide context for answering their question.',
//     input_schema: {
//       type: 'object',
//       properties: {
//         memberId: { type: 'string', description: 'The authenticated member ID' },
//       },
//       required: ['memberId'],
//     },
//   },
// ];

export const handler = async (event: { body: string; pathParameters: { memberId: string } }) => {
  const { message } = JSON.parse(event.body) as { message: string };
  const { memberId } = event.pathParameters;

  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `MEMBER#${memberId}`,
        ':prefix': 'RX#',
      },
    }),
  );

  const prescriptions = result.Items ?? [];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: `You are a medication assistant. Answer questions based only on this member's prescriptions: ${JSON.stringify(prescriptions)}. Today is ${new Date().toISOString().split('T')[0]}.`,
    messages: [{ role: 'user', content: message }],
  });

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
