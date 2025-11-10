This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Firebase Storage 설정

이 프로젝트는 Firebase Storage를 사용하여 프로필 이미지와 파일을 관리합니다.

### 빠른 시작

```bash
# Firebase 설정 확인
npm run check-firebase

# Storage Rules 배포
npm run deploy:storage

# CORS 설정 (Google Cloud SDK 필요)
gsutil cors set cors.json gs://smis-mentor.firebasestorage.app
```

### 상세 가이드

- **빠른 해결**: [QUICK_FIX.md](./QUICK_FIX.md) - Firebase Console에서 즉시 해결하는 방법
- **상세 설정**: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - 전체 설정 프로세스

### 주요 파일

- `serviceAccountKey.json` - Firebase Admin SDK 인증 키 (Git에 커밋되지 않음)
- `storage.rules` - Firebase Storage 보안 규칙
- `cors.json` - CORS 설정
- `check-firebase-setup.js` - 설정 확인 스크립트

## 네이버 클라우드 플랫폼 SMS API 설정

이 프로젝트는 네이버 클라우드 플랫폼의 SMS API를 사용하여 문자 메시지를 발송합니다. 
서비스를 이용하기 위해서는 다음과 같은 설정이 필요합니다:

1. [네이버 클라우드 플랫폼](https://www.ncloud.com)에서 계정 생성 및 로그인
2. 콘솔에서 Simple & Easy Notification Service(SENS) 서비스 활성화
3. 프로젝트 생성 및 SMS 서비스 설정
4. 아래 환경 변수를 `.env.local` 파일에 추가:

```bash
# 네이버 클라우드 플랫폼 SMS API
NAVER_CLOUD_SMS_SERVICE_ID="ncp:sms:kr:xxxxxxxxx:xxxx"  # 서비스 ID
NAVER_CLOUD_SMS_ACCESS_KEY="xxxxxxxxxxxxxxxxxxxx"       # 액세스 키
NAVER_CLOUD_SMS_SECRET_KEY="xxxxxxxxxxxxxxxxxxxx"       # 시크릿 키
```

자세한 설정 방법은 [네이버 클라우드 플랫폼 API 가이드](https://api.ncloud-docs.com/docs/ai-application-service-sens-smsv2)를 참고하세요.

## SMS 템플릿 관리

SMS 템플릿은 Firebase Firestore의 `smsTemplates` 컬렉션에 저장됩니다.
관리자 패널에서 템플릿을 추가, 수정, 삭제할 수 있습니다.

템플릿에서는 다음과 같은 변수를 사용할 수 있습니다:
- `{이름}`: 수신자 이름
- `{휴대폰번호}`: 수신자 휴대폰 번호
- `{이메일}`: 수신자 이메일
- `{면접일자}`: 면접 날짜 (yyyy년 MM월 dd일 형식)
- `{면접시간}`: 면접 시간 (HH:mm 형식)
- `{채용공고명}`: 채용 공고 제목

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
