# 🔐 환경변수 설정 가이드

## Vercel에서 환경변수 복사하기

1. **Vercel 로그인**
   - https://vercel.com/pobredwards-projects/smis-mentor/settings/environment-variables

2. **환경변수 복사**
   - 각 변수의 값을 복사
   - `packages/web/.env.local` 파일에 붙여넣기

## 필요한 환경변수 목록

### Firebase 설정 (필수)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=smis-mentor.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=smis-mentor
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=smis-mentor.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### 네이버 클라우드 SMS API (선택)
```bash
NAVER_CLOUD_SMS_SERVICE_ID=
NAVER_CLOUD_SMS_ACCESS_KEY=
NAVER_CLOUD_SMS_SECRET_KEY=
```

## 설정 완료 후

```bash
# 개발 서버 재시작
npm run dev:web
```

## 파일 위치

- **이전**: `/smis-mentor/.env.local`
- **현재**: `/smis-mentor/packages/web/.env.local`

## 주의사항

⚠️ `.env.local` 파일은 Git에 커밋되지 않습니다 (이미 .gitignore에 포함됨)
✅ 팀원과 공유할 때는 보안 채널을 통해 공유하세요

## Firebase 설정 확인 방법

Firebase Console에서도 확인 가능:
https://console.firebase.google.com/project/smis-mentor/settings/general
