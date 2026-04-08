#!/usr/local/opt/node/bin/node
import * as cdk from 'aws-cdk-lib/core';
import { BackendStack } from '../lib/backend-stack';
import { CIStack } from '../lib/ci-stack';

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'us-west-2';

const app = new cdk.App();

new BackendStack(app, 'BackendStack', {
  env: { account: account, region: region },
});

new CIStack(app, 'MedTrackCIStack', {
  env: { account: account, region: region },
});
