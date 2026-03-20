# 알림 아이콘 및 Expo 개발 환경 정리

## 현재 상황 요약

### ✅ 정상 작동 중
- 푸시 알림 기능 완벽 작동
- 푸시 토큰 등록 성공: `ExponentPushToken[mY2cxsEqKTB7yqPfRtSLZg]`
- 즉시 알림, 예약 알림 모두 정상
- Deprecation warning 수정 완료

### ❌ Expo Go 제한사항
- **커스텀 알림 아이콘은 Expo Go에서 표시 불가**
- Expo Go는 기본 Expo 아이콘만 표시
- 이는 Expo의 정상적인 동작입니다

## 커스텀 알림 아이콘을 보려면

### 필수: Development Build 생성

```bash
cd packages/mobile

# 방법 1: EAS Build (클라우드, 추천)
eas build --profile development --platform android

# 방법 2: 로컬 빌드 (빠름, Android Studio/Xcode 필요)
npx expo prebuild --clean
npx expo run:android  # Android
npx expo run:ios     # iOS (macOS만)
```

### Development Build 설치 후
1. 생성된 APK/IPA를 기기에 설치
2. 앱 실행 (Expo Go와 별개의 앱)
3. 푸시 알림 테스트
4. **SMIS 아이콘이 표시됨** ✅

## 파일 상태

### ✅ 준비 완료
- `packages/mobile/assets/notification-icon.png` - SMIS 아이콘 복사됨
- `packages/mobile/app.json` - 알림 설정 완료
- `notificationService.ts` - Deprecation warning 수정

### 📝 설정 내용
```json
{
  "expo-notifications": {
    "icon": "./assets/notification-icon.png",
    "color": "#3b82f6",
    "androidMode": "default",
    "androidCollapsedTitle": "SMIS Mentor"
  }
}
```

## 빌드 명령어

### Development Build (알림 아이콘 테스트용)
```bash
# Android
npm run build:mobile:dev:android

# iOS
npm run build:mobile:dev:ios
```

### Production Build (최종 배포용)
```bash
# Android
npm run build:mobile:prod:android

# iOS
npm run build:mobile:prod:ios
```

## FAQ

### Q: Expo Go에서 왜 커스텀 아이콘이 안 보이나요?
**A**: Expo Go는 사전 빌드된 앱으로, 네이티브 리소스(알림 아이콘 등)를 변경할 수 없습니다. Development Build를 생성해야 합니다.

### Q: Development Build는 어떻게 다른가요?
**A**: 
- Expo Go: 공통 앱, 네이티브 설정 불가
- Development Build: 프로젝트별 앱, 모든 네이티브 설정 적용 가능
- 둘 다 Fast Refresh, Hot Reload 지원

### Q: 개발 속도가 느려지나요?
**A**: 
- 초기 빌드: 15-30분 소요
- 이후 개발: Expo Go와 동일하게 빠름
- 코드 변경 시 재빌드 불필요

### Q: 프로덕션 배포 시 문제 없나요?
**A**: 네, 모든 설정이 완료되었습니다. Production Build 시 SMIS 아이콘이 정상 표시됩니다.

## 다음 단계

### 1. 즉시 (Expo Go 계속 사용)
- [x] 알림 기능 개발 완료
- [x] 로직 테스트 완료
- [ ] 커스텀 아이콘은 나중에 확인

### 2. 빠른 시일 내 (Development Build)
```bash
npm run build:mobile:dev:android
```
- 생성된 APK 설치
- SMIS 알림 아이콘 확인

### 3. 배포 전 (Production Build)
```bash
npm run build:mobile:prod:android
npm run build:mobile:prod:ios
```
- TestFlight/Internal Testing
- 최종 알림 아이콘 검증

## 참고 문서

- `EXPO_NOTIFICATION_ICON_LIMITATION.md` - 상세 제한사항 설명
- `NOTIFICATION_ICON_GUIDE.md` - 알림 아이콘 생성 가이드
- `NOTIFICATION_TEST_GUIDE.md` - 알림 테스트 방법
- `PUSH_NOTIFICATION_GUIDE.md` - 전체 구현 가이드

## 결론

현재 상황은 **정상**입니다. Expo Go의 제한사항일 뿐이며, Development Build나 Production Build에서는 SMIS 알림 아이콘이 정상적으로 표시됩니다.
