# 비밀번호 재설정 메일 문제 해결 가이드

## 수정된 사항

### 1. 코드 개선
- `actionCodeSettings` 추가: 리디렉션 URL 설정
- 성공 로그 추가: 이메일 발송 성공 시 콘솔에 로그 출력
- 에러 처리 개선: 다양한 Firebase 에러 코드 처리
  - `auth/user-not-found`: 계정이 존재하지 않음
  - `auth/invalid-email`: 잘못된 이메일 형식
  - `auth/too-many-requests`: 너무 많은 요청
- 사용자 피드백 개선: 스팸함 확인 안내 메시지 추가

### 2. 수정된 파일
- `/packages/web/src/lib/firebaseService.ts`
- `/src/lib/firebaseService.ts`
- `/packages/mobile/src/services/authService.ts`
- `/packages/web/src/app/sign-in/SignInClient.tsx`
- `/src/app/sign-in/SignInClient.tsx`
- `/packages/mobile/src/screens/SignInScreen.tsx`

## Firebase 콘솔에서 확인할 사항

### 1. Authentication 이메일 템플릿 설정
1. Firebase Console 접속: https://console.firebase.google.com/
2. 프로젝트 선택: `smis-mentor`
3. 왼쪽 메뉴에서 **Authentication** 클릭
4. 상단 탭에서 **Templates** 클릭
5. **Password reset** 템플릿 확인
   - 템플릿이 활성화되어 있는지 확인
   - 발신자 이름과 이메일 주소 확인
   - 이메일 본문 확인

### 2. 승인된 도메인 확인
1. Authentication → Settings 탭
2. **Authorized domains** 섹션 확인
3. 다음 도메인들이 추가되어 있는지 확인:
   - `localhost` (개발 환경)
   - 실제 배포 도메인 (예: `smis-mentor.com`, `www.smis-mentor.com`)

### 3. 이메일 제공업체 설정 확인
1. Authentication → Sign-in method 탭
2. **Email/Password** 제공업체가 활성화되어 있는지 확인
3. 이메일 링크(비밀번호 없는 로그인) 설정 확인

### 4. SMTP 설정 (선택사항)
Firebase는 기본적으로 자체 이메일 서비스를 사용하지만, 커스텀 SMTP를 설정할 수도 있습니다:
- Blaze(종량제) 플랜에서는 SendGrid, AWS SES 등을 사용 가능
- Functions를 통해 커스텀 이메일 발송 구현 가능

## 테스트 방법

### 1. 개발자 도구에서 확인
```javascript
// 브라우저 콘솔에서 실행
resetPassword('test@example.com')
  .then(() => console.log('✅ 이메일 발송 성공'))
  .catch((error) => console.error('❌ 이메일 발송 실패:', error));
```

### 2. 네트워크 탭 확인
1. 브라우저 개발자 도구 → Network 탭 열기
2. 비밀번호 재설정 버튼 클릭
3. Firebase API 호출 확인:
   - 요청 URL: `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode`
   - 응답 상태 코드: `200 OK`
   - 응답 본문에 `email` 필드 포함

### 3. Firebase Console 로그 확인
1. Firebase Console → Authentication → Users
2. 해당 이메일 계정이 존재하는지 확인
3. Cloud Functions 로그 확인 (Functions를 사용하는 경우)

## 일반적인 문제 및 해결 방법

### 문제 1: 이메일이 스팸함으로 감
**해결 방법:**
- 스팸함 확인
- Firebase 발신자 주소를 연락처에 추가
- 도메인 인증 설정 (SPF, DKIM, DMARC)

### 문제 2: 이메일이 아예 도착하지 않음
**해결 방법:**
1. Firebase Console에서 이메일 템플릿 활성화 여부 확인
2. 승인된 도메인 목록에 현재 도메인 추가
3. 이메일 주소가 실제로 존재하는지 확인
4. Firebase 프로젝트의 Quota 확인 (무료 플랜 제한)

### 문제 3: "auth/user-not-found" 오류
**해결 방법:**
- 이메일 주소가 정확한지 확인
- Firebase Console → Authentication → Users에서 계정 존재 여부 확인

### 문제 4: "auth/too-many-requests" 오류
**해결 방법:**
- 잠시 후 다시 시도
- Firebase Console에서 Rate Limiting 설정 확인

### 문제 5: 이메일 발송 속도가 느림
**해결 방법:**
- Firebase는 스팸 방지를 위해 이메일 발송에 지연이 있을 수 있음
- 일반적으로 1-5분 내 도착
- 개발 환경에서는 더 빠르게 도착할 수 있음

## 추가 디버깅 팁

### 1. 콘솔 로그 확인
수정된 코드는 이메일 발송 성공 시 콘솔에 로그를 출력합니다:
```
비밀번호 재설정 이메일 발송 성공: user@example.com
```

### 2. Firebase Emulator 사용
로컬 개발 시 Firebase Emulator를 사용하면 이메일이 콘솔에 출력됩니다:
```bash
firebase emulators:start --only auth
```

### 3. 테스트 계정 생성
Firebase Console에서 테스트용 이메일 계정을 만들어 테스트하세요.

## 문의 사항
문제가 계속되면 다음 정보와 함께 문의해주세요:
1. 사용한 이메일 주소
2. 브라우저 콘솔의 오류 메시지
3. 네트워크 탭의 Firebase API 응답
4. Firebase Console에서 확인한 설정 스크린샷
