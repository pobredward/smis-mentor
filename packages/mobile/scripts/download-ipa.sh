#!/bin/bash

# 최신 iOS 빌드를 다운로드하는 스크립트

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║   iOS IPA 다운로드 (Transporter용)    ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# 다운로드 디렉토리
DOWNLOAD_DIR="$HOME/Downloads"
cd "$DOWNLOAD_DIR"

echo -e "${YELLOW}📦 최신 iOS 빌드 정보:${NC}"
echo "  Version: 1.1.0"
echo "  Build Number: 17"
echo "  Status: ✅ FINISHED"
echo ""

# IPA URL
IPA_URL="https://expo.dev/artifacts/eas/nnxjjxnhov6UzESowpcF7t.ipa"
OUTPUT_FILE="SMISMentor-1.1.0-17.ipa"

echo -e "${BLUE}⬇️  다운로드 중...${NC}"
if curl -L -o "$OUTPUT_FILE" "$IPA_URL"; then
    echo -e "${GREEN}✅ 다운로드 완료!${NC}"
    echo ""
    echo -e "${YELLOW}📍 저장 위치: ${DOWNLOAD_DIR}/${OUTPUT_FILE}${NC}"
    echo ""
    echo -e "${BLUE}다음 단계:${NC}"
    echo "1. Mac에서 'Transporter' 앱 실행"
    echo "   (App Store에서 다운로드: https://apps.apple.com/app/transporter/id1450874784)"
    echo ""
    echo "2. 다운로드한 IPA 파일을 Transporter에 드래그 앤 드롭"
    echo "   위치: ${DOWNLOAD_DIR}/${OUTPUT_FILE}"
    echo ""
    echo "3. 'Deliver' 버튼 클릭하여 App Store Connect에 업로드"
    echo ""
    echo "4. App Store Connect에서 확인 (5-10분 후)"
    echo "   https://appstoreconnect.apple.com/apps/6759916856"
    echo ""
    
    # Transporter 앱 열기 시도
    if command -v open &> /dev/null; then
        echo -e "${YELLOW}🚀 Transporter 앱을 열까요? (y/n)${NC}"
        read -r response
        if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
            open -a "Transporter" 2>/dev/null || echo "Transporter 앱을 찾을 수 없습니다. App Store에서 설치하세요."
        fi
    fi
    
    # Finder로 파일 표시
    echo ""
    echo -e "${YELLOW}📁 Finder에서 파일을 표시할까요? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        open -R "$OUTPUT_FILE"
    fi
else
    echo -e "${RED}❌ 다운로드 실패${NC}"
    echo "URL을 확인하거나 Expo 대시보드에서 직접 다운로드하세요:"
    echo "https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds"
    exit 1
fi
