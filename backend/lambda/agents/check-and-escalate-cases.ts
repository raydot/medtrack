import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

export type CaseDecision = 'proceed' | 'skip' | 'escalate';

export interface CheckCasesInput {
  memberId: string;
  agentType: string;
}

export const handler = async (
  event: CheckCasesInput,
): Promise<{ decision: CaseDecision; caseId?: string }> => {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: '#status = :open AND agentType = :agentType',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':pk': `MEMBER#${event.memberId}`,
        ':prefix': 'CASE#',
        ':open': 'open',
        ':agentType': event.agentType,
      },
    }),
  );

  const cases = result.Items ?? [];
  if (cases.length === 0) return { decision: 'proceed' };

  // Sort by createdAt descending — most recent first
  const latest = cases.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const ageInDays = (Date.now() - new Date(latest.createdAt).getTime()) / (1000 * 60 * 60 * 24);

  if (ageInDays < 3) return { decision: 'skip', caseId: latest.SK };

  // Escalate urgency
  const newUrgency = ageInDays >= 7 ? 'critical' : 'urgent';
  await dynamo.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: { PK: `MEMBER#${event.memberId}`, SK: latest.SK },
      UpdateExpression: 'SET urgency = :urgency',
      ExpressionAttributeValues: { ':urgency': newUrgency },
    }),
  );

  return { decision: 'escalate', caseId: latest.SK };
};
