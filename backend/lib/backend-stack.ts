import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table
    const table = new dynamodb.Table(this, 'MedTrackTable', {
      tableName: 'MedTrack',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastFillDate', type: dynamodb.AttributeType.STRING },
    });

    // Lambda function
    const getPrescriptionsLambda = new lambda.Function(this, 'GetPrescriptionsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'get-prescriptions.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    // Grant Lambda read access to DynamoDB
    table.grantReadData(getPrescriptionsLambda);

    // API Gateway
    const api = new apigateway.RestApi(this, 'MedTrackApi', {
      restApiName: 'MedTrack API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
      },
    });

    const prescriptions = api.root.addResource('prescriptions');
    const byMember = prescriptions.addResource('{memberId}');
    byMember.addMethod('GET', new apigateway.LambdaIntegration(getPrescriptionsLambda));

    // Tool Lambdas
    const triggerRefillLambda = new lambdaNodejs.NodejsFunction(this, 'TriggerRefillFunction', {
      entry: path.join(__dirname, '../lambda/agents/trigger-refill.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });

    const flagForReviewLambda = new lambdaNodejs.NodejsFunction(this, 'FlagForReviewFunction', {
      entry: path.join(__dirname, '../lambda/agents/flag-for-review.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: { TABLE_NAME: table.tableName },
    });

    // Refill Agent Lambda
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

    // Permissions
    table.grantWriteData(triggerRefillLambda);
    table.grantWriteData(flagForReviewLambda);
    table.grantReadData(refillAgentLambda);
    triggerRefillLambda.grantInvoke(refillAgentLambda);
    flagForReviewLambda.grantInvoke(refillAgentLambda);

    // EventBridge daily cron
    const rule = new events.Rule(this, 'DailyRefillRule', {
      schedule: events.Schedule.cron({ hour: '8', minute: '0' }),
    });
    rule.addTarget(new targets.LambdaFunction(refillAgentLambda));

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
  }
}
