# 환경 변수

## 웹 앱 (packages/web/.env.local)

```bash
# Firebase 설정
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=smis-mentor.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=smis-mentor
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=smis-mentor.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# 네이버 클라우드 플랫폼 SMS API
NAVER_CLOUD_SMS_SERVICE_ID=ncp:sms:kr:xxxxxxxxx:xxxx
NAVER_CLOUD_SMS_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
NAVER_CLOUD_SMS_SECRET_KEY=xxxxxxxxxxxxxxxxxxxx
```

## Firebase Functions (functions/.env)

```bash
# Google Sheets API (서비스 계정 키는 JSON 파일 사용)
# managesheet-export-fb9c3744de0f.json 파일 필요

# Firebase Admin SDK
# 자동으로 프로젝트 설정 사용
```

## 모바일 앱 (packages/mobile/.env) - 추후

```bash
# Firebase 설정 (웹과 동일)
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=smis-mentor.firebaseapp.com
FIREBASE_PROJECT_ID=smis-mentor

# API 엔드포인트
API_BASE_URL=https://asia-northeast3-smis-mentor.cloudfunctions.net
```

## 설정 방법

1. 각 디렉토리에 `.env.local` 또는 `.env` 파일 생성
2. 위 템플릿 복사 후 실제 값으로 교체
3. Git에 커밋하지 않기 (이미 .gitignore에 포함됨)
