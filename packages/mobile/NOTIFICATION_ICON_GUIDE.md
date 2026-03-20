# 알림 아이콘 생성 가이드

## Android 알림 아이콘 요구사항

Android 알림 아이콘은 특별한 요구사항이 있습니다:

### 1. 파일 스펙
- **크기**: 96x96 픽셀 (mdpi 기준)
- **형식**: PNG (투명 배경)
- **색상**: 단색 (흰색 또는 투명), 실루엣 스타일
- **배경**: 완전 투명
- **위치**: `packages/mobile/assets/notification-icon.png`

### 2. 디자인 가이드라인
- 단순한 형태 (복잡한 디테일 피하기)
- 선명한 실루엣
- 패딩 포함 (아이콘이 잘리지 않도록)
- Android Material Design 가이드라인 준수

## 알림 아이콘 생성 방법

### 방법 1: 온라인 도구 사용 (권장)

1. **Android Asset Studio** 방문
   - https://romannurik.github.io/AndroidAssetStudio/icons-notification.html

2. **아이콘 업로드**
   - `packages/mobile/assets/icon.png` 업로드
   - 또는 클립아트/텍스트에서 선택

3. **설정 조정**
   - Trim: Yes
   - Padding: 25%
   - Color: White

4. **다운로드**
   - Generate 클릭
   - 생성된 아이콘 다운로드

5. **파일 배치**
   - `res/drawable-mdpi/ic_stat_name.png` (96x96)를 
   - `packages/mobile/assets/notification-icon.png`로 복사

### 방법 2: 직접 생성

아래 명령어로 기존 icon.png를 알림 아이콘으로 변환:

```bash
# ImageMagick 설치 필요
# macOS
brew install imagemagick

# 알림 아이콘 생성 (흰색 실루엣)
cd packages/mobile/assets
convert icon.png -resize 96x96 -alpha extract -negate notification-icon.png
```

### 방법 3: 디자이너에게 요청

디자이너에게 다음 스펙으로 요청:
- 크기: 96x96px
- 형식: PNG
- 배경: 투명
- 스타일: 흰색 실루엣
- 파일명: notification-icon.png

## iOS 알림 아이콘

iOS는 자동으로 앱 아이콘을 사용하므로 별도 파일 불필요

## 임시 해결책

알림 아이콘을 생성하기 전까지 임시로 기존 아이콘 사용:

```bash
cd packages/mobile/assets
cp icon.png notification-icon.png
```

단, 이 경우 Android에서 알림 아이콘이 정사각형으로 표시될 수 있습니다.

## 적용 후 확인

1. **앱 재빌드 필요**
   ```bash
   # 네이티브 변경사항 적용
   cd packages/mobile
   npx expo prebuild --clean
   
   # 또는 개발 빌드
   npm run build:mobile:dev:android
   npm run build:mobile:dev:ios
   ```

2. **테스트**
   - 푸시 알림 테스트 화면에서 알림 전송
   - 알림 바에서 아이콘 확인

## 문제 해결

### 아이콘이 표시되지 않을 때
- 파일 경로 확인: `packages/mobile/assets/notification-icon.png`
- 파일 크기 확인: 96x96px
- 앱 재빌드 필요
- 기기 재부팅

### 아이콘이 정사각형으로 표시될 때
- 투명 배경인지 확인
- 단색 실루엣 스타일로 재생성
- Android Asset Studio 사용 권장
