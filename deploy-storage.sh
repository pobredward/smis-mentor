#!/bin/bash

echo "🔥 Firebase Storage Rules 및 CORS 설정 배포"
echo ""

# Storage Rules 배포
echo "1️⃣ Storage Rules 배포 중..."
firebase deploy --only storage:rules

# CORS 설정 적용
echo ""
echo "2️⃣ CORS 설정 적용 중..."
echo "다음 명령어를 수동으로 실행하세요:"
echo ""
echo "gsutil cors set cors.json gs://smis-mentor.firebasestorage.app"
echo ""
echo "또는"
echo ""
echo "gcloud storage buckets update gs://smis-mentor.firebasestorage.app --cors-file=cors.json"
echo ""

echo "✅ 완료!"
