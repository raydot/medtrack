import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event: { memberId: string; rxId: string; reason: string }) => {
  const { memberId, rxId, reason } = event;

  await docClient.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        PK: `MEMBER#${memberId}`,
        SK: `REVIEW#${rxId}`,
        memberId,
        rxId,
        reason,
        flaggedAt: new Date().toISOString(),
        flaggedBy: 'refill-agent',
        status: 'pending-review',
      },
    }),
  );

  return { success: true, memberId, rxId, reason };
};
