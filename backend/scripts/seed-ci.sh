#!/bin/bash

AWS_REGION=us-west-2
TABLE=MedTrack-CI
FORMULARY_TABLE=MedTrackFormulary-CI
DATE_10=$(date -u -d '10 days ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-10d '+%Y-%m-%dT%H:%M:%SZ')
DATE_3=$(date -u -d '3 days ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -v-3d '+%Y-%m-%dT%H:%M:%SZ')
DATE_10_SHORT=$(date -u -d '10 days ago' '+%Y-%m-%d' 2>/dev/null || date -u -v-10d '+%Y-%m-%d')
DATE_3_SHORT=$(date -u -d '3 days ago' '+%Y-%m-%d' 2>/dev/null || date -u -v-3d '+%Y-%m-%d')

# ── DIAGNOSIS rows ────────────────────────────────────────────────────────────
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-123"},"SK":{"S":"DIAGNOSIS#I10"},"memberId":{"S":"member-123"},"icd10Code":{"S":"I10"},"description":{"S":"Hypertension"},"diagnosedAt":{"S":"2024-01-15"},"expectedMedications":{"L":[{"S":"ACE inhibitor"},{"S":"ARB"},{"S":"calcium channel blocker"}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-123"},"SK":{"S":"DIAGNOSIS#E11"},"memberId":{"S":"member-123"},"icd10Code":{"S":"E11"},"description":{"S":"Type 2 Diabetes"},"diagnosedAt":{"S":"2024-03-20"},"expectedMedications":{"L":[{"S":"biguanide"},{"S":"insulin"},{"S":"GLP-1 agonist"}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-456"},"SK":{"S":"DIAGNOSIS#K21.0"},"memberId":{"S":"member-456"},"icd10Code":{"S":"K21.0"},"description":{"S":"GERD"},"diagnosedAt":{"S":"2024-06-10"},"expectedMedications":{"L":[{"S":"proton pump inhibitor"},{"S":"H2 blocker"}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-789"},"SK":{"S":"DIAGNOSIS#E03.9"},"memberId":{"S":"member-789"},"icd10Code":{"S":"E03.9"},"description":{"S":"Hypothyroidism"},"diagnosedAt":{"S":"2023-11-05"},"expectedMedications":{"L":[{"S":"thyroid hormone replacement"}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-321"},"SK":{"S":"DIAGNOSIS#F32.9"},"memberId":{"S":"member-321"},"icd10Code":{"S":"F32.9"},"description":{"S":"Depression"},"diagnosedAt":{"S":"2024-08-01"},"expectedMedications":{"L":[{"S":"SSRI"},{"S":"SNRI"},{"S":"tricyclic antidepressant"}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-new-001"},"SK":{"S":"DIAGNOSIS#I10"},"memberId":{"S":"member-new-001"},"icd10Code":{"S":"I10"},"description":{"S":"Hypertension"},"diagnosedAt":{"S":"2025-01-10"},"expectedMedications":{"L":[{"S":"ACE inhibitor"},{"S":"ARB"},{"S":"calcium channel blocker"}]}}'

# ── RX rows — new members ─────────────────────────────────────────────────────
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-new-001"},"SK":{"S":"RX#rx-016"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Omeprazole"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-01"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-new-001"},"id":{"S":"rx-016"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-new-002"},"SK":{"S":"RX#rx-017"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Lisinopril"},"daysSupply":{"N":"30"},"lastFillDate":{"S":"2026-03-15"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-new-002"},"id":{"S":"rx-017"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBER#member-new-002"},"SK":{"S":"RX#rx-018"},"GSI1PK":{"S":"STATUS#ok"},"drugName":{"S":"Metformin"},"daysSupply":{"N":"90"},"lastFillDate":{"S":"2026-03-01"},"refillStatus":{"S":"ok"},"memberId":{"S":"member-new-002"},"id":{"S":"rx-018"}}'

# ── DISCHARGE rows ────────────────────────────────────────────────────────────
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item "{\"PK\":{\"S\":\"MEMBER#member-789\"},\"SK\":{\"S\":\"DISCHARGE#${DATE_10}\"},\"memberId\":{\"S\":\"member-789\"},\"dischargeDate\":{\"S\":\"${DATE_10_SHORT}\"},\"admissionReason\":{\"S\":\"Cardiac arrhythmia\"},\"dischargeMedications\":{\"L\":[{\"S\":\"rx-007\"},{\"S\":\"rx-008\"}]},\"readmissionWindowDays\":{\"N\":\"30\"}}"
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item "{\"PK\":{\"S\":\"MEMBER#member-321\"},\"SK\":{\"S\":\"DISCHARGE#${DATE_3}\"},\"memberId\":{\"S\":\"member-321\"},\"dischargeDate\":{\"S\":\"${DATE_3_SHORT}\"},\"admissionReason\":{\"S\":\"Severe depressive episode\"},\"dischargeMedications\":{\"L\":[{\"S\":\"rx-011\"},{\"S\":\"rx-012\"}]},\"readmissionWindowDays\":{\"N\":\"30\"}}"

# ── MedTrackFormulary rows ────────────────────────────────────────────────────
aws dynamodb put-item --region $AWS_REGION --table-name $FORMULARY_TABLE --item '{"PK":{"S":"DRUG#atorvastatin"},"SK":{"S":"PLAN#plan-001"},"drugName":{"S":"Atorvastatin"},"therapeuticClass":{"S":"statin"},"tier":{"N":"3"},"covered":{"BOOL":true},"effectiveDate":{"S":"2026-03-01"},"previousTier":{"N":"2"},"alternatives":{"L":[{"M":{"drugName":{"S":"Rosuvastatin"},"tier":{"N":"1"}}},{"M":{"drugName":{"S":"Simvastatin"},"tier":{"N":"2"}}}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $FORMULARY_TABLE --item '{"PK":{"S":"DRUG#sertraline"},"SK":{"S":"PLAN#plan-001"},"drugName":{"S":"Sertraline"},"therapeuticClass":{"S":"SSRI"},"tier":{"N":"2"},"covered":{"BOOL":true},"effectiveDate":{"S":"2025-01-01"},"alternatives":{"L":[{"M":{"drugName":{"S":"Fluoxetine"},"tier":{"N":"1"}}},{"M":{"drugName":{"S":"Escitalopram"},"tier":{"N":"2"}}}]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $FORMULARY_TABLE --item '{"PK":{"S":"DRUG#lisinopril"},"SK":{"S":"PLAN#plan-001"},"drugName":{"S":"Lisinopril"},"therapeuticClass":{"S":"ACE inhibitor"},"tier":{"N":"1"},"covered":{"BOOL":true},"effectiveDate":{"S":"2025-01-01"},"alternatives":{"L":[]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $FORMULARY_TABLE --item '{"PK":{"S":"DRUG#metformin"},"SK":{"S":"PLAN#plan-001"},"drugName":{"S":"Metformin"},"therapeuticClass":{"S":"biguanide"},"tier":{"N":"1"},"covered":{"BOOL":true},"effectiveDate":{"S":"2025-01-01"},"alternatives":{"L":[]}}'
aws dynamodb put-item --region $AWS_REGION --table-name $FORMULARY_TABLE --item '{"PK":{"S":"DRUG#omeprazole"},"SK":{"S":"PLAN#plan-001"},"drugName":{"S":"Omeprazole"},"therapeuticClass":{"S":"proton pump inhibitor"},"tier":{"N":"2"},"covered":{"BOOL":true},"effectiveDate":{"S":"2025-01-01"},"alternatives":{"L":[{"M":{"drugName":{"S":"Pantoprazole"},"tier":{"N":"1"}}}]}}'

# ── MEMBER lookup table ───────────────────────────────────────────────────────
# Enables the Orchestrator to list all members without a table scan
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-123"},"memberId":{"S":"member-123"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-456"},"memberId":{"S":"member-456"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-789"},"memberId":{"S":"member-789"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-321"},"memberId":{"S":"member-321"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-654"},"memberId":{"S":"member-654"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-new-001"},"memberId":{"S":"member-new-001"}}'
aws dynamodb put-item --region $AWS_REGION --table-name $TABLE --item '{"PK":{"S":"MEMBERS"},"SK":{"S":"MEMBER#member-new-002"},"memberId":{"S":"member-new-002"}}'


echo "Phase 2 seeding complete!"
