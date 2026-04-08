import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';

const langfuseEnv = {
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY ?? '',
  LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL ?? '',
};

export class CIStack extends cdk.Stack {
  public readonly orchestratorFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -------------------------------------------------------------------------
    // DynamoDB — single table design (CI)
    // -------------------------------------------------------------------------

    const table = new dynamodb.Table(this, 'MedTrackTable', {
      tableName: 'MedTrack-CI',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
      tableName: 'MedTrackFormulary-CI',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // -------------------------------------------------------------------------
    // Tool Lambdas
    // -------------------------------------------------------------------------

    const triggerRefillLambda = new lambdaNodejs.NodejsFunction(this, 'TriggerRefillFunction-CI', {
      functionName: 'TriggerRefillFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/trigger-refill.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(triggerRefillLambda);

    const flagForReviewLambda = new lambdaNodejs.NodejsFunction(this, 'FlagForReviewFunction-CI', {
      functionName: 'FlagForReviewFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/flag-for-review.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(flagForReviewLambda);

    // -------------------------------------------------------------------------
    // Agent 1: Refill Agent — no EventBridge trigger in CI
    // -------------------------------------------------------------------------

    const refillAgentLambda = new lambdaNodejs.NodejsFunction(this, 'RefillAgentFunction-CI', {
      functionName: 'RefillAgentFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/refill-agent.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        TRIGGER_REFILL_FUNCTION: triggerRefillLambda.functionName,
        FLAG_FOR_REVIEW_FUNCTION: flagForReviewLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        ...langfuseEnv,
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

    // -------------------------------------------------------------------------
    // Agent 2: Coordinator Copilot — no API Gateway in CI
    // -------------------------------------------------------------------------

    const coordinatorCopilotLambda = new lambdaNodejs.NodejsFunction(
      this,
      'CoordinatorCopilotFunction-CI',
      {
        functionName: 'CoordinatorCopilotFunction-CI',
        entry: path.join(__dirname, '../lambda/agents/coordinator-copilot.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(60),
        environment: {
          TABLE_NAME: table.tableName,
          TRIGGER_REFILL_FUNCTION: triggerRefillLambda.functionName,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
          ...langfuseEnv,
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

    // -------------------------------------------------------------------------
    // Agent 3: Member Chat — no API Gateway in CI
    // -------------------------------------------------------------------------

    const memberChatLambda = new lambdaNodejs.NodejsFunction(this, 'MemberChatFunction-CI', {
      functionName: 'MemberChatFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/member-chat.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        ...langfuseEnv,
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
    // Operational Memory
    // -------------------------------------------------------------------------

    const openCaseLambda = new lambdaNodejs.NodejsFunction(this, 'OpenCaseFunction-CI', {
      functionName: 'OpenCaseFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/open-case.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantWriteData(openCaseLambda);

    const checkAndEscalateCasesLambda = new lambdaNodejs.NodejsFunction(
      this,
      'CheckAndEscalateCasesFunction-CI',
      {
        functionName: 'CheckAndEscalateCasesFunction-CI',
        entry: path.join(__dirname, '../lambda/agents/check-and-escalate-cases.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: { TABLE_NAME: table.tableName },
      },
    );
    table.grantReadWriteData(checkAndEscalateCasesLambda);

    // -------------------------------------------------------------------------
    // Agent 4: Gap in Care
    // -------------------------------------------------------------------------

    const gapInCareLambda = new lambdaNodejs.NodejsFunction(this, 'GapInCareFunction-CI', {
      functionName: 'GapInCareFunction-CI',
      entry: path.join(__dirname, '../lambda/agents/gap-in-care.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        OPEN_CASE_FUNCTION: openCaseLambda.functionName,
        ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        ...langfuseEnv,
      },
    });
    table.grantReadData(gapInCareLambda);
    openCaseLambda.grantInvoke(gapInCareLambda);

    // -------------------------------------------------------------------------
    // Agent 5: Readmission Risk
    // -------------------------------------------------------------------------

    const readmissionRiskLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ReadmissionRiskFunction-CI',
      {
        functionName: 'ReadmissionRiskFunction-CI',
        entry: path.join(__dirname, '../lambda/agents/readmission-risk.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(30),
        environment: {
          TABLE_NAME: table.tableName,
          OPEN_CASE_FUNCTION: openCaseLambda.functionName,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
          ...langfuseEnv,
        },
      },
    );
    table.grantReadData(readmissionRiskLambda);
    openCaseLambda.grantInvoke(readmissionRiskLambda);

    // -------------------------------------------------------------------------
    // Agent 6: Formulary Switch
    // -------------------------------------------------------------------------

    const formularySwitchLambda = new lambdaNodejs.NodejsFunction(
      this,
      'FormularySwitchFunction-CI',
      {
        functionName: 'FormularySwitchFunction-CI',
        entry: path.join(__dirname, '../lambda/agents/formulary-switch.ts'),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(30),
        environment: {
          TABLE_NAME: table.tableName,
          FORMULARY_TABLE_NAME: formularyTable.tableName,
          OPEN_CASE_FUNCTION: openCaseLambda.functionName,
          ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
          ...langfuseEnv,
        },
      },
    );
    table.grantReadData(formularySwitchLambda);
    formularyTable.grantReadData(formularySwitchLambda);
    openCaseLambda.grantInvoke(formularySwitchLambda);

    // -------------------------------------------------------------------------
    // Orchestrator — no EventBridge cron in CI, invoked directly by evaluate script
    // -------------------------------------------------------------------------

    this.orchestratorFunction = new lambdaNodejs.NodejsFunction(this, 'OrchestratorFunction-CI', {
      functionName: 'OrchestratorFunction-CI',
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
        ...langfuseEnv,
      },
    });
    table.grantReadData(this.orchestratorFunction);
    checkAndEscalateCasesLambda.grantInvoke(this.orchestratorFunction);
    refillAgentLambda.grantInvoke(this.orchestratorFunction);
    gapInCareLambda.grantInvoke(this.orchestratorFunction);
    readmissionRiskLambda.grantInvoke(this.orchestratorFunction);
    formularySwitchLambda.grantInvoke(this.orchestratorFunction);
    this.orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      }),
    );
  }
}
