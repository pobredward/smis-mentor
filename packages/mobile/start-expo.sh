#!/bin/bash

# Expo 개발 서버 시작 스크립트
# CI 모드 비활성화 및 캐시 초기화

cd "$(dirname "$0")"

# 환경 변수 로드
if [ -f "../../.env.local" ]; then
  export $(cat ../../.env.local | grep -v '^#' | xargs)
fi

# CI 모드 명시적 비활성화
unset CI
export CI=false

# 이전 프로세스 정리
pkill -f "expo start" || true
pkill -f "Metro" || true

# Watchman 캐시 초기화 (설치되어 있는 경우)
if command -v watchman &> /dev/null; then
  watchman watch-del-all
fi

# 캐시 정리
rm -rf .expo node_modules/.cache

echo "Starting Expo..."
npx expo start --go --port 8082
