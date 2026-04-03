#!/bin/bash

# EAS 환경 변수 설정 스크립트
# 사용법: ./scripts/setup-eas-env.sh [environment]
# 예시: ./scripts/setup-eas-env.sh production

set -e  # 에러 발생 시 스크립트 중단

ENVIRONMENT=${1:-"all"}

echo "🔧 EAS 환경 변수 설정 시작..."
echo ""

# 환경 변수 추가 함수
add_env_vars() {
  local ENV=$1
  echo "📦 $ENV 환경 변수 생성 중..."
  
  # 🌐 웹 API URL (환경별 다름)
  if [ "$ENV" = "development" ]; then
    eas env:create --name EXPO_PUBLIC_WEB_API_URL --value "http://localhost:3000" --environment $ENV --visibility plaintext --force --non-interactive || true
  else
    eas env:create --name EXPO_PUBLIC_WEB_API_URL --value "https://www.smis-mentor.com" --environment $ENV --visibility plaintext --force --non-interactive || true
  fi
  
  # 🔑 Google 로그인
  eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com" --environment $ENV --visibility plaintext --force --non-interactive || true
  eas env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com" --environment $ENV --visibility plaintext --force --non-interactive || true
  eas env:create --name EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID --value "382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com" --environment $ENV --visibility plaintext --force --non-interactive || true
  
  # 🔑 네이버 로그인
  eas env:create --name EXPO_PUBLIC_NAVER_CLIENT_ID --value "XgK86FxXznee_HFfBeH3" --environment $ENV --visibility plaintext --force --non-interactive || true
  eas env:create --name EXPO_PUBLIC_NAVER_CLIENT_SECRET --value "GcoXVzqEZs" --environment $ENV --visibility plaintext --force --non-interactive || true
  eas env:create --name EXPO_PUBLIC_NAVER_CALLBACK_URL --value "https://auth.expo.io/@pobredward02/smis-mentor" --environment $ENV --visibility plaintext --force --non-interactive || true
  
  # 🐛 Sentry (클라이언트)
  eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://8df6107450a728a3f4eca979860e74ca@o4511139689791488.ingest.us.sentry.io/4511139715088384" --environment $ENV --visibility plaintext --force --non-interactive || true
  
  # 🔨 Sentry (빌드 타임 - 비밀 정보)
  eas env:create --name SENTRY_ORG --value "pobredward" --environment $ENV --visibility secret --force --non-interactive || true
  eas env:create --name SENTRY_PROJECT --value "smis-mentor-mobile" --environment $ENV --visibility secret --force --non-interactive || true
  eas env:create --name SENTRY_AUTH_TOKEN --value "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" --environment $ENV --visibility secret --force --non-interactive || true
  
  echo "✅ $ENV 환경 변수 생성 완료"
  echo ""
}

# 환경별 실행
if [ "$ENVIRONMENT" = "all" ]; then
  add_env_vars "development"
  add_env_vars "preview"
  add_env_vars "production"
elif [ "$ENVIRONMENT" = "development" ] || [ "$ENVIRONMENT" = "preview" ] || [ "$ENVIRONMENT" = "production" ]; then
  add_env_vars "$ENVIRONMENT"
else
  echo "❌ 잘못된 환경: $ENVIRONMENT"
  echo "사용법: ./scripts/setup-eas-env.sh [development|preview|production|all]"
  exit 1
fi

echo "✅ EAS 환경 변수 설정 완료!"
echo ""
echo "📋 확인 방법:"
echo "  - CLI: eas env:list"
echo "  - 웹: https://expo.dev/accounts/pobredward02/projects/smis-mentor/environment-variables"
echo ""
echo "⚠️  주의사항:"
echo "  - 네이버 클라우드 SMS API 환경 변수는 웹 서버(Next.js)에만 필요합니다"
echo "  - Firebase Admin SDK 환경 변수는 웹 서버(Next.js)에만 필요합니다"
echo "  - 모바일 앱에서는 이 변수들을 사용하지 않습니다"
