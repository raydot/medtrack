import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: { memberId: string; rxId: string }) => {
  const { memberId, rxId } = event;

  await docClient.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        PK: `MEMBER#${memberId}`,
        SK: `REFILL#${rxId}`,
        memberId,
        rxId,
        status: 'triggered',
        triggeredAt: new Date().toISOString(),
        triggeredBy: 'refill-agent',
      },
    }),
  );

  return { success: true, memberId, rxId };
};
