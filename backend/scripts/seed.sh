#!/bin/bash

AWS_REGION=us-west-2
TABLE=MedTrack

# Member 123
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-123"},"SK":{"S":"RX#rx-001"},"GSI1PK":{"S":"STATUS#overdue"},"drugName":{"S":"Lisinopril"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-02-01"},"refillStatus":{"S":"overdue"},"memberId":{"S":"member-123"},"id":{"S":"rx-001"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-123"},"SK":{"S":"RX#rx-002"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Metformin"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-02-15"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-123"},"id":{"S":"rx-002"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-123"},"SK":{"S":"RX#rx-003"},"GSI1PK":{"S":"STATUS#due"},"drugName":{"S":"Atorvastatin"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-05"},"refillStatus":{"S":"due"},"memberId":{"S":"member-123"},"id":{"S":"rx-003"}}'

# Member 456
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-456"},"SK":{"S":"RX#rx-004"},"GSI1PK":{"S":"STATUS#due"},"drugName":{"S":"Amlodipine"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-01"},"refillStatus":{"S":"due"},"memberId":{"S":"member-456"},"id":{"S":"rx-004"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-456"},"SK":{"S":"RX#rx-005"},"GSI1PK":{"S":"STATUS#overdue"},"drugName":{"S":"Omeprazole"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-01-15"},"refillStatus":{"S":"overdue"},"memberId":{"S":"member-456"},"id":{"S":"rx-005"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-456"},"SK":{"S":"RX#rx-006"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Sertraline"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-10"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-456"},"id":{"S":"rx-006"}}'

# Member 789
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-789"},"SK":{"S":"RX#rx-007"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Levothyroxine"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-03-01"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-789"},"id":{"S":"rx-007"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-789"},"SK":{"S":"RX#rx-008"},"GSI1PK":{"S":"STATUS#overdue"},"drugName":{"S":"Gabapentin"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-01-20"},"refillStatus":{"S":"overdue"},"memberId":{"S":"member-789"},"id":{"S":"rx-008"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-789"},"SK":{"S":"RX#rx-009"},"GSI1PK":{"S":"STATUS#due"},"drugName":{"S":"Hydrochlorothiazide"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-15"},"refillStatus":{"S":"due"},"memberId":{"S":"member-789"},"id":{"S":"rx-009"}}'

# Member 321
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-321"},"SK":{"S":"RX#rx-010"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Pantoprazole"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-20"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-321"},"id":{"S":"rx-010"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-321"},"SK":{"S":"RX#rx-011"},"GSI1PK":{"S":"STATUS#overdue"},"drugName":{"S":"Metoprolol"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-02-01"},"refillStatus":{"S":"overdue"},"memberId":{"S":"member-321"},"id":{"S":"rx-011"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-321"},"SK":{"S":"RX#rx-012"},"GSI1PK":{"S":"STATUS#due"},"drugName":{"S":"Fluoxetine"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-10"},"refillStatus":{"S":"due"},"memberId":{"S":"member-321"},"id":{"S":"rx-012"}}'

# Member 654
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-654"},"SK":{"S":"RX#rx-013"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Losartan"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-18"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-654"},"id":{"S":"rx-013"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-654"},"SK":{"S":"RX#rx-014"},"GSI1PK":{"S":"STATUS#overdue"},"drugName":{"S":"Albuterol"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-02-10"},"refillStatus":{"S":"overdue"},"memberId":{"S":"member-654"},"id":{"S":"rx-014"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-654"},"SK":{"S":"RX#rx-015"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Escitalopram"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-03-01"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-654"},"id":{"S":"rx-015"}}'

echo "Seeding complete!"
