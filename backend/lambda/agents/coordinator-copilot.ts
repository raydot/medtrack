import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const tools = [
  {
    name: 'getMembersByStatus',
    description:
      'Get all members with prescriptions matching a given refill status, optionally filtered by drug class.',
    input_schema: {
      type: 'object',
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
      type: 'object',
      properties: {
        memberId: { type: 'string' },
        rxId: { type: 'string' },
      },
      required: ['memberId', 'rxId'],
    },
  },
];

export const handler = async (event: { message: string }) => {
  // TODO: implement ReAct loop
  // 1. Send message + tools to Bedrock
  // 2. If Claude returns tool_use, execute the tool
  // 3. Send result back to Claude
  // 4. Return final text response
  return { message: 'Coordinator Copilot stub — not yet implemented' };
};
