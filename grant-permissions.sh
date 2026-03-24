#!/bin/bash

# Firebase Project ID
PROJECT_ID="smis-mentor"

# Service Account 이메일 (App Engine default)
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

echo "🔑 Service Account에 Token Creator 권한 부여 중..."
echo "Project: $PROJECT_ID"
echo "Service Account: $SERVICE_ACCOUNT"
echo ""
echo "다음 명령어를 Google Cloud Shell에서 실행하세요:"
echo ""
echo "gcloud projects add-iam-policy-binding $PROJECT_ID \\"
echo "  --member=\"serviceAccount:$SERVICE_ACCOUNT\" \\"
echo "  --role=\"roles/iam.serviceAccountTokenCreator\""
echo ""
echo "또는 Google Cloud Console에서:"
echo "1. https://console.cloud.google.com/iam-admin/iam?project=$PROJECT_ID"
echo "2. Service Accounts로 이동"
echo "3. $SERVICE_ACCOUNT 찾기"
echo "4. 'Service Account Token Creator' 역할 추가"
