#!/bin/bash
set -e

# Ensure we run from the backend directory regardless of where the script is called from
cd "$(dirname "$0")/.."

AWS_REGION=us-west-2

echo "Deleting CI DynamoDB tables..."
aws dynamodb delete-table --table-name MedTrack-CI --region $AWS_REGION 2>/dev/null || true
aws dynamodb delete-table --table-name MedTrackFormulary-CI --region $AWS_REGION 2>/dev/null || true

echo "Waiting for table deletion..."
sleep 10

echo "Deleting CI Lambda log groups..."
for fn in TriggerRefillFunction-CI FlagForReviewFunction-CI RefillAgentFunction-CI \
  CoordinatorCopilotFunction-CI MemberChatFunction-CI OpenCaseFunction-CI \
  CheckAndEscalateCasesFunction-CI GapInCareFunction-CI ReadmissionRiskFunction-CI \
  FormularySwitchFunction-CI OrchestratorFunction-CI; do
  aws logs delete-log-group --log-group-name /aws/lambda/$fn --region $AWS_REGION 2>/dev/null || true
done

echo "Destroying CDK stack..."
echo "Current dir: $(pwd)"
# npx cdk destroy MedTrackCIStack --force 2>/dev/null || true
./node_modules/.bin/cdk destroy MedTrackCIStack

echo "CI teardown complete."
