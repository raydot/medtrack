import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

export interface OpenCaseInput {
  memberId: string;
  coordinatorId: string;
  agentType: 'REFILL' | 'GAP_IN_CARE' | 'READMISSION' | 'FORMULARY_SWITCH';
  urgency: 'routine' | 'urgent' | 'critical';
  reasoning: string;
}

export const handler = async (event: OpenCaseInput) => {
  const timestamp = new Date().toISOString();

  await dynamo.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        PK: `MEMBER#${event.memberId}`,
        SK: `CASE#${timestamp}#${event.agentType}`,
        GSI2PK: `COORDINATOR#${event.coordinatorId}`,
        GSI2SK: `${event.urgency}#${timestamp}`,
        memberId: event.memberId,
        coordinatorId: event.coordinatorId,
        agentType: event.agentType,
        urgency: event.urgency,
        reasoning: event.reasoning,
        status: 'open',
        createdAt: timestamp,
      },
    }),
  );

  return { success: true, memberId: event.memberId, agentType: event.agentType };
};
