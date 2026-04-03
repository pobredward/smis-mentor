#!/bin/bash

# SMIS Mentor 모바일 앱 배포 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로고 출력
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║   SMIS Mentor Mobile Deployment      ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# 사용법
usage() {
    echo "사용법: $0 [OPTIONS]"
    echo ""
    echo "옵션:"
    echo "  ios              iOS만 빌드 및 배포"
    echo "  android          Android만 빌드 및 배포"
    echo "  all              iOS와 Android 모두 빌드 및 배포"
    echo "  build-only-ios   iOS 빌드만 (제출 안 함)"
    echo "  build-only-android  Android 빌드만 (제출 안 함)"
    echo "  submit-only-ios  최신 iOS 빌드 제출만"
    echo "  submit-only-android  최신 Android 빌드 제출만"
    echo ""
    echo "예제:"
    echo "  $0 ios           # iOS 빌드 및 App Store 제출"
    echo "  $0 android       # Android 빌드 및 Play Store 제출"
    echo "  $0 all           # 양쪽 모두 배포"
    exit 1
}

# 인자가 없으면 사용법 표시
if [ $# -eq 0 ]; then
    usage
fi

PLATFORM=$1

# 현재 디렉토리 확인
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ 에러: package.json을 찾을 수 없습니다.${NC}"
    echo "packages/mobile 디렉토리에서 실행하세요."
    exit 1
fi

# EAS CLI 설치 확인
if ! command -v eas &> /dev/null; then
    echo -e "${YELLOW}⚠️  EAS CLI가 설치되어 있지 않습니다.${NC}"
    echo "설치 중..."
    npm install -g eas-cli
fi

# 버전 정보 표시
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}📦 현재 버전: ${VERSION}${NC}"
echo ""

# 빌드 함수
build_ios() {
    echo -e "${BLUE}🍎 iOS 프로덕션 빌드 시작...${NC}"
    eas build --profile production --platform ios --non-interactive
    echo -e "${GREEN}✅ iOS 빌드 완료${NC}"
}

build_android() {
    echo -e "${BLUE}🤖 Android 프로덕션 빌드 시작...${NC}"
    eas build --profile production --platform android --non-interactive
    echo -e "${GREEN}✅ Android 빌드 완료${NC}"
}

# 제출 함수
submit_ios() {
    echo -e "${BLUE}📤 App Store Connect에 제출 중...${NC}"
    
    # 최신 빌드 제출 시도
    if eas submit --platform ios --latest --non-interactive; then
        echo -e "${GREEN}✅ iOS 제출 완료${NC}"
        echo ""
        echo -e "${YELLOW}📱 다음 단계:${NC}"
        echo "1. App Store Connect 접속: https://appstoreconnect.apple.com/apps/6759916856"
        echo "2. TestFlight에서 빌드 확인 (5-10분 소요)"
        echo "3. 앱 심사 제출"
    else
        echo -e "${YELLOW}⚠️  자동 제출 실패${NC}"
        echo ""
        echo "수동 제출 방법:"
        echo "1. IPA 다운로드: https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds"
        echo "2. Transporter 앱으로 업로드"
        echo "3. 자세한 가이드: DEPLOYMENT.md 참조"
    fi
}

submit_android() {
    echo -e "${BLUE}📤 Google Play Console에 제출 중...${NC}"
    
    if eas submit --platform android --latest --non-interactive; then
        echo -e "${GREEN}✅ Android 제출 완료${NC}"
        echo ""
        echo -e "${YELLOW}📱 다음 단계:${NC}"
        echo "1. Play Console 접속: https://play.google.com/console"
        echo "2. 내부 테스트 트랙 확인"
        echo "3. 프로덕션 승격"
    else
        echo -e "${YELLOW}⚠️  자동 제출 실패${NC}"
        echo ""
        echo "수동 제출 방법:"
        echo "1. AAB 다운로드: https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds"
        echo "2. Play Console에서 수동 업로드"
        echo "3. 자세한 가이드: DEPLOYMENT.md 참조"
    fi
}

# 플랫폼별 실행
case $PLATFORM in
    ios)
        build_ios
        echo ""
        submit_ios
        ;;
    android)
        build_android
        echo ""
        submit_android
        ;;
    all)
        echo -e "${BLUE}🚀 iOS와 Android 모두 빌드 중...${NC}"
        eas build --profile production --platform all --non-interactive
        echo -e "${GREEN}✅ 모든 빌드 완료${NC}"
        echo ""
        submit_ios
        echo ""
        submit_android
        ;;
    build-only-ios)
        build_ios
        echo ""
        echo -e "${YELLOW}📝 빌드만 완료되었습니다. 제출하려면:${NC}"
        echo "npm run submit:ios"
        ;;
    build-only-android)
        build_android
        echo ""
        echo -e "${YELLOW}📝 빌드만 완료되었습니다. 제출하려면:${NC}"
        echo "npm run submit:android"
        ;;
    submit-only-ios)
        submit_ios
        ;;
    submit-only-android)
        submit_android
        ;;
    *)
        echo -e "${RED}❌ 알 수 없는 옵션: $PLATFORM${NC}"
        usage
        ;;
esac

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          배포 작업 완료! 🎉           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
