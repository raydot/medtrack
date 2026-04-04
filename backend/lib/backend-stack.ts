import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';

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

    // Lambda function
    const getPrescriptionsLambda = new lambda.Function(this, 'GetPrescriptionsFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'get-prescriptions.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
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
  }
}
