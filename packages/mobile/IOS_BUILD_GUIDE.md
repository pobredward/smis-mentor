# iOS 빌드 진행 가이드

## 🎯 현재 상태

✅ **완료된 작업**:
- EAS 프로젝트 연결 완료 (ID: `684d0445-c299-4e77-a362-42efa9c671ac`)
- `app.json` 설정 완료 (Bundle ID: `com.smis.smismentor`)
- Expo Secrets 환경 변수 로드 확인
- `ITSAppUsesNonExemptEncryption` 설정 추가
- BuildNumber 자동 증가 (1 → 2)

❌ **대기 중인 작업**:
- Apple 계정 연동 및 인증서 생성 (사용자 입력 필요)

---

## 📱 iOS 빌드 실행 방법

### 1단계: 터미널에서 빌드 명령 실행

다음 명령어를 **직접 터미널에서** 실행하세요:

\`\`\`bash
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
eas build --profile production --platform ios
\`\`\`

### 2단계: Apple 계정 로그인

빌드 중에 다음과 같은 질문이 나타납니다:

**Q: Do you want to log in to your Apple account?**
- **A: Y** (Yes 입력)

그 다음:
- **Apple ID**: Apple Developer 계정 이메일 입력
- **Password**: Apple 계정 비밀번호 입력
- **2FA Code**: (필요시) 2단계 인증 코드 입력

### 3단계: 인증서 생성

EAS가 자동으로 다음을 생성합니다:
- Distribution Certificate
- Provisioning Profile
- Push Notification Key (필요시)

모든 질문에 **Y** 또는 기본값으로 진행하면 됩니다.

### 4단계: 빌드 대기

빌드가 EAS 서버에서 진행됩니다:
- 예상 시간: **15-30분**
- 진행 상황은 터미널과 [Expo 대시보드](https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds)에서 확인 가능

---

## 🔑 필요한 정보

### Apple Developer 계정 요구사항

1. **Apple Developer Program 가입** ($99/년)
   - [https://developer.apple.com/programs/](https://developer.apple.com/programs/)
   
2. **Bundle Identifier 등록**
   - Bundle ID: `com.smis.smismentor`
   - App Store Connect에서 앱 등록 필요

---

## 📊 빌드 진행 상황 확인

### 터미널
\`\`\`bash
# 빌드 목록 조회
eas build:list

# 특정 빌드 상세 조회
eas build:view [BUILD_ID]
\`\`\`

### 웹 대시보드
[https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds](https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds)

---

## ⚠️ 문제 해결

### "Invalid code signing credentials" 오류
- Apple Developer 계정에 로그인했는지 확인
- Bundle ID가 Apple Developer Portal에 등록되어 있는지 확인

### "App ID cannot be registered" 오류
- Bundle ID `com.smis.smismentor`가 이미 사용 중이거나 예약되어 있을 수 있음
- Apple Developer Portal에서 수동으로 App ID 생성 필요

### 인증서 수동 관리
\`\`\`bash
# 인증서 관리 메뉴 열기
eas credentials
\`\`\`

---

## ✅ 빌드 완료 후

빌드가 성공하면:

1. **IPA 파일 다운로드 링크** 제공
2. **TestFlight 내부 테스트** 가능
3. **App Store Connect 제출** 준비 완료

### App Store Connect 제출

\`\`\`bash
cd packages/mobile
eas submit --platform ios
\`\`\`

또는 App Store Connect에서 수동 업로드도 가능합니다.

---

## 📝 참고사항

### BuildNumber 관리
- EAS가 자동으로 버전 관리 (`appVersionSource: "remote"`)
- 현재 BuildNumber: **2**
- 다음 빌드 시 자동 증가

### 환경 변수
다음 변수들이 Expo Secrets에서 자동 로드됩니다:
- `EXPO_PUBLIC_WEB_API_URL`
- `NAVER_CLOUD_SMS_SERVICE_ID`
- `NAVER_CLOUD_SMS_ACCESS_KEY`
- `NAVER_CLOUD_SMS_SECRET_KEY`

---

## 🚀 빠른 시작

\`\`\`bash
# 1. 빌드 시작
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
eas build --profile production --platform ios

# 2. Apple 계정으로 로그인 (프롬프트 따라가기)

# 3. 빌드 완료 대기 (15-30분)

# 4. TestFlight 테스트 또는 App Store 제출
eas submit --platform ios
\`\`\`

---

**중요**: 이 명령어는 **인터랙티브 입력이 필요**하므로 반드시 **직접 터미널에서 실행**해야 합니다!
