import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

const CORS_OPTIONS: apigateway.ResourceOptions = {
  defaultCorsPreflightOptions: { allowOrigins: apigateway.Cors.ALL_ORIGINS },
};

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // DynamoDB — single table design
    // -------------------------------------------------------------------------

    const table = new dynamodb.Table(this, 'MedTrackTable', {
      tableName: 'MedTrack',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI: query all prescriptions by refill status across all members
    table.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastFillDate', type: dynamodb.AttributeType.STRING },
    });

    table.addGlobalSecondaryIndex({
      indexName: 'CoordinatorCasesIndex',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
    });

    const formularyTable = new dynamodb.Table(this, 'MedTrackFormularyTable', {
      tableName: 'MedTrackFormulary',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // -------------------------------------------------------------------------
    // API Gateway
    // -------------------------------------------------------------------------

    const api = new apigateway.RestApi(this, 'MedTrackApi', {
      restApiName: 'MedTrack API',
      defaultCorsPreflightOptions: { allowOrigins: apigateway.Cors.ALL_ORIGINS },
    });

    // -------------------------------------------------------------------------
    // GET /prescriptions/{memberId}
    // -------------------------------------------------------------------------

    const getPrescriptionsLambda = new lambda.Function(this, 'GetPrescriptionsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'get-prescriptions.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      environment: { TABLE_NAME: table.tableName },
    });

    table.grantReadData(getPrescriptionsLambda);

    api.root
      .addResource('prescriptions')
      .addResource('{memberId}')
      .addMethod('GET', new apigateway.LambdaIntegration(getPrescriptionsLambda));

    // -------------------------------------------------------------------------
    // Tool Lambdas — called by agents, never directly by API Gateway
    // Agents do not write to DynamoDB directly; all writes go through these.
    // -------------------------------------------------------------------------

    const triggerRefillLambda = new lambdaNodejs.NodejsFunction(this, 'TriggerRefillFunction', {
      entry: path.join(__dirname, '../lambda/agents/trigger-refill.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });

    table.grantWriteData(triggerRefillLambda);

    const flagForReviewLambda = new lambdaNodejs.NodejsFunction(this, 'FlagForReviewFunction', {
      entry: path.join(__dirname, '../lambda/agents/flag-for-review.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });

    table.grantWriteData(flagForReviewLambda);

    // -------------------------------------------------------------------------
    // Agent 1: Refill Agent — autonomous, triggered by EventBridge cron
    // Scans overdue prescriptions daily and triggers refills or flags for review
    // -------------------------------------------------------------------------

    const refillAgentLambda = new lambdaNodejs.NodejsFunction(this, 'RefillAgentFunction', {
      entry: path.join(__dirname, '../lambda/agents/refill-agent.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        TRIGGER_REFILL_FUNCTION: triggerRefillLambda.functionName,
        FLAG_FOR_REVIEW_FUNCTION: flagForReviewLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      },
    });

    table.grantReadData(refillAgentLambda);
    triggerRefillLambda.grantInvoke(refillAgentLambda);
    flagForReviewLambda.grantInvoke(refillAgentLambda);
    refillAgentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'aws-marketplace:ViewSubscriptions',
          'aws-marketplace:Subscribe',
        ],
        resources: ['*'],
      }),
    );

    const dailyRefillRule = new events.Rule(this, 'DailyRefillRule', {
      schedule: events.Schedule.cron({ hour: '8', minute: '0' }),
    });
    dailyRefillRule.addTarget(new targets.LambdaFunction(refillAgentLambda));

    // -------------------------------------------------------------------------
    // Agent 2: Coordinator Copilot — POST /agent/coordinator
    // ReAct loop: natural language queries over member panel, human-in-the-loop
    // -------------------------------------------------------------------------

    const coordinatorCopilotLambda = new lambdaNodejs.NodejsFunction(
      this,
      'CoordinatorCopilotFunction',
      {
        entry: path.join(__dirname, '../lambda/agents/coordinator-copilot.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(60),
        environment: {
          TABLE_NAME: table.tableName,
          TRIGGER_REFILL_FUNCTION: triggerRefillLambda.functionName,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        },
      },
    );

    table.grantReadData(coordinatorCopilotLambda);
    triggerRefillLambda.grantInvoke(coordinatorCopilotLambda);
    coordinatorCopilotLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    const agentResource = api.root.addResource('agent');
    agentResource
      .addResource('coordinator', CORS_OPTIONS)
      .addMethod('POST', new apigateway.LambdaIntegration(coordinatorCopilotLambda));

    // -------------------------------------------------------------------------
    // Agent 3: Member Chat — POST /agent/member-chat/{memberId}
    // RAG-lite: pre-loads member prescriptions as context before each Bedrock call
    // memberId comes from the authenticated session (path parameter), never user input
    // -------------------------------------------------------------------------

    const memberChatLambda = new lambdaNodejs.NodejsFunction(this, 'MemberChatFunction', {
      entry: path.join(__dirname, '../lambda/agents/member-chat.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      },
    });

    table.grantReadData(memberChatLambda);
    memberChatLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    // -------------------------------------------------------------------------
    // Operational Memory — CASE# read/write Lambdas
    // Called by specialist agents and the Orchestrator, not by API Gateway
    // -------------------------------------------------------------------------

    const openCaseLambda = new lambdaNodejs.NodejsFunction(this, 'OpenCaseFunction', {
      entry: path.join(__dirname, '../lambda/agents/open-case.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });

    const checkAndEscalateCasesLambda = new lambdaNodejs.NodejsFunction(
      this,
      'CheckAndEscalateCasesFunction',
      {
        entry: path.join(__dirname, '../lambda/agents/check-and-escalate-cases.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: { TABLE_NAME: table.tableName },
      },
    );

    table.grantWriteData(openCaseLambda);
    table.grantReadWriteData(checkAndEscalateCasesLambda);

    // -------------------------------------------------------------------------
    // Agent 4: Gap in Care — identifies missing standard-of-care medications
    // Invoked by Orchestrator triage; writes CASE# via openCaseLambda
    // -------------------------------------------------------------------------

    const gapInCareLambda = new lambdaNodejs.NodejsFunction(this, 'GapInCareFunction', {
      entry: path.join(__dirname, '../lambda/agents/gap-in-care.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        OPEN_CASE_FUNCTION: openCaseLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      },
    });

    table.grantReadData(gapInCareLambda);
    openCaseLambda.grantInvoke(gapInCareLambda);

    // -------------------------------------------------------------------------
    // Agent 5: Readmission Risk — monitors recently discharged members
    // Triggered by Orchestrator triage; urgency tiered by days since discharge
    // -------------------------------------------------------------------------

    const readmissionRiskLambda = new lambdaNodejs.NodejsFunction(this, 'ReadmissionRiskFunction', {
      entry: path.join(__dirname, '../lambda/agents/readmission-risk.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        OPEN_CASE_FUNCTION: openCaseLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      },
    });

    table.grantReadData(readmissionRiskLambda);
    openCaseLambda.grantInvoke(readmissionRiskLambda);

    // -------------------------------------------------------------------------
    // Agent 6: Formulary Switch — identifies tier changes and drafts prescriber outreach
    // Coordinator must approve outreach before anything is sent — hard human-in-the-loop
    // -------------------------------------------------------------------------

    const formularySwitchLambda = new lambdaNodejs.NodejsFunction(this, 'FormularySwitchFunction', {
      entry: path.join(__dirname, '../lambda/agents/formulary-switch.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        FORMULARY_TABLE_NAME: formularyTable.tableName,
        OPEN_CASE_FUNCTION: openCaseLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
      },
    });

    table.grantReadData(formularySwitchLambda);
    formularyTable.grantReadData(formularySwitchLambda);
    openCaseLambda.grantInvoke(formularySwitchLambda);

    // -------------------------------------------------------------------------
    // Orchestrator — coordinates all six agents
    // Nightly cron at 02:00 UTC; also triggered by DynamoDB Streams (next phase)
    // -------------------------------------------------------------------------

    const orchestratorLambda = new lambdaNodejs.NodejsFunction(this, 'OrchestratorFunction', {
      entry: path.join(__dirname, '../lambda/agents/orchestrator.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(300),
      environment: {
        TABLE_NAME: table.tableName,
        CHECK_CASES_FUNCTION: checkAndEscalateCasesLambda.functionName,
        REFILL_AGENT_FUNCTION: refillAgentLambda.functionName,
        GAP_IN_CARE_FUNCTION: gapInCareLambda.functionName,
        READMISSION_RISK_FUNCTION: readmissionRiskLambda.functionName,
        FORMULARY_SWITCH_FUNCTION: formularySwitchLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY ?? '',
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY ?? '',
        LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL ?? '',
      },
    });

    table.grantReadData(orchestratorLambda);
    checkAndEscalateCasesLambda.grantInvoke(orchestratorLambda);
    refillAgentLambda.grantInvoke(orchestratorLambda);
    gapInCareLambda.grantInvoke(orchestratorLambda);
    readmissionRiskLambda.grantInvoke(orchestratorLambda);
    formularySwitchLambda.grantInvoke(orchestratorLambda);
    orchestratorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );

    const nightlyOrchestratorRule = new events.Rule(this, 'NightlyOrchestratorRule', {
      schedule: events.Schedule.cron({ hour: '2', minute: '0' }),
    });
    nightlyOrchestratorRule.addTarget(new targets.LambdaFunction(orchestratorLambda));

    agentResource
      .addResource('member-chat')
      .addResource('{memberId}', CORS_OPTIONS)
      .addMethod('POST', new apigateway.LambdaIntegration(memberChatLambda));
  }
}
